import os, json, uuid, datetime, hashlib, hmac, base64
from io import BytesIO
from functools import wraps

from flask import Flask, request, jsonify, send_from_directory
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from flask_cors import CORS
from werkzeug.utils import secure_filename

from config import Config
from models import db, User, DeliveryPerson, Order, Rating, Dispute, Warning, Transaction

app = Flask(__name__)
app.config.from_object(Config)
db.init_app(app)
jwt = JWTManager(app)
CORS(app)
os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

with app.app_context():
    db.create_all()
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in {"png", "jpg", "jpeg", "gif"}

def calc_price(package_size, weight=0):
    prices = {"small": Config.PRICE_SMALL, "medium": Config.PRICE_MEDIUM,
              "large": Config.PRICE_LARGE, "xlarge": Config.PRICE_XLARGE}
    base = prices.get(package_size, Config.PRICE_SMALL)
    extra = 0
    if weight > Config.WEIGHT_THRESHOLD:
        extra = (weight - Config.WEIGHT_THRESHOLD) * Config.PRICE_PER_KG_OVER_5
    return base + extra

def make_warning(delivery_person_id, order_id, reason):
    warn = Warning(delivery_person_id=delivery_person_id, order_id=order_id, reason=reason)
    db.session.add(warn)
    dp = DeliveryPerson.query.get(delivery_person_id)
    if dp:
        dp.warning_count = (dp.warning_count or 0) + 1
        if dp.warning_count >= Config.MAX_WARNINGS:
            dp.is_blocked = True
    return warn

def admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role not in ("admin", "super_admin"):
            return jsonify({"error": "需要管理员权限"}), 403
        return fn(*args, **kwargs)
    return wrapper

def super_admin_required(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user_id = int(get_jwt_identity())
        user = User.query.get(user_id)
        if not user or user.role != "super_admin":
            return jsonify({"error": "需要超级管理员权限"}), 403
        return fn(*args, **kwargs)
    return wrapper

# === Auth ===

@app.route("/api/auth/register", methods=["POST"])
def register():
    data = request.get_json()
    if not data:
        return jsonify({"error": "请提供注册信息"}), 400
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    login_role = data.get("login_role", "").strip()
    role = data.get("role", "publisher")
    phone = data.get("phone", "").strip()
    if not username or not password:
        return jsonify({"error": "用户名和密码不能为空"}), 400
    if len(password) < 6:
        return jsonify({"error": "密码至少需要6位"}), 400
    if role not in ("publisher", "delivery", "admin"):
        return jsonify({"error": "无效的角色"}), 400
    if User.query.filter_by(username=username).first():
        return jsonify({"error": "用户名已存在"}), 409

    user = User(username=username, role=role, phone=phone)
    user.set_password(password)
    if role == "admin":
        admin_count = User.query.filter(User.role.in_(["admin", "super_admin"])).count()
        if admin_count >= 4:
            return jsonify({"error": "管理员数量已达上限（最多4名）"}), 400
        if admin_count == 0:
            user.role = "super_admin"
    db.session.add(user)
    # Role-based access control
    if login_role:
        if login_role == "admin":
            if user.role not in ("admin", "super_admin"):
                return jsonify({"error": "该账号不是管理员"}), 403
        elif login_role != user.role:
            if login_role == "delivery":
                return jsonify({"error": "该账号不是接单人，请使用接单入口登录"}), 403
            elif login_role == "publisher":
                return jsonify({"error": "该账号不是取件人，请使用取件入口登录"}), 403

    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()}), 201

@app.route("/api/auth/login", methods=["POST"])
def login():
    data = request.get_json()
    if not data:
        return jsonify({"error": "请提供登录信息"}), 400
    username = data.get("username", "").strip()
    password = data.get("password", "").strip()
    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({"error": "用户名或密码错误"}), 401
    login_role = data.get("login_role", "").strip()
    if login_role:
        if login_role == "admin":
            if user.role not in ("admin", "super_admin"):
                return jsonify({"error": "该账号不是管理员"}), 403
        elif login_role != user.role:
            if login_role == "delivery":
                return jsonify({"error": "该账号不是接单人，请使用接单入口登录"}), 403
            elif login_role == "publisher":
                return jsonify({"error": "该账号不是取件人，请使用取件入口登录"}), 403
    if not user.is_active:
        return jsonify({"error": "账号已被禁用"}), 403
    token = create_access_token(identity=str(user.id))
    return jsonify({"token": token, "user": user.to_dict()}), 200

@app.route("/api/auth/profile", methods=["GET"])
@jwt_required()
def profile():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    data = user.to_dict()
    if user.role == "delivery" and user.delivery_profile:
        data["delivery_profile"] = user.delivery_profile.to_dict()
    return jsonify(data), 200

@app.route("/api/auth/profile", methods=["PUT"])
@jwt_required()
def update_profile():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    data = request.get_json()
    if "phone" in data:
        user.phone = data["phone"]
    return jsonify(user.to_dict()), 200

# === Orders ===

@app.route("/api/orders", methods=["POST"])
@jwt_required()
def create_order():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    data = request.get_json()
    for field in ["pickup_address", "pickup_code", "delivery_address", "package_size", "tracking_number"]:
        if field not in data or not data[field]:
            return jsonify({"error": f"请填写{field}"}), 400
    if data["package_size"] not in ("small", "medium", "large", "xlarge"):
        return jsonify({"error": "无效的包裹大小"}), 400
    weight = float(data.get("weight", 0))
    price = calc_price(data["package_size"], weight)
    order = Order(
        publisher_id=user_id, tracking_number=data["tracking_number"],
        pickup_address=data["pickup_address"], pickup_code=data["pickup_code"],
        delivery_address=data["delivery_address"], package_size=data["package_size"],
        weight=weight, price=price, notes=data.get("notes", ""), status="pending",
    )
    order.payment_type = "cod" if price < 10 else "prepay"
    db.session.add(order)
    return jsonify(order.to_dict(include_tracking=True)), 201

@app.route("/api/orders", methods=["GET"])
@jwt_required()
def list_orders():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    role = user.role
    status_filter = request.args.get("status")
    
    if role == "publisher":
        query = Order.query.filter_by(publisher_id=user_id)
    elif role == "delivery":
        if status_filter == "available":
            query = Order.query.filter_by(status="pending")
        elif status_filter == "mine":
            query = Order.query.filter_by(delivery_person_id=user_id)
        else:
            query = Order.query.filter(db.or_(Order.status == "pending", Order.delivery_person_id == user_id))
    elif role in ("admin", "super_admin"):
        query = Order.query
    else:
        return jsonify({"error": "无权限"}), 403

    if status_filter and role not in ("admin", "super_admin"):
        query = query.filter_by(status=status_filter)
    
    orders = query.order_by(Order.created_at.desc()).all()
    result = []
    for o in orders:
        include = o.publisher_id == user_id or o.delivery_person_id == user_id or role in ("admin", "super_admin")
        result.append(o.to_dict(include_tracking=include))
    return jsonify(result), 200

@app.route("/api/orders/available", methods=["GET"])
@jwt_required()
def available_orders():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    orders = Order.query.filter_by(status="pending").order_by(Order.created_at.desc()).all()
    return jsonify([o.to_dict(include_tracking=False) for o in orders]), 200

@app.route("/api/orders/<int:order_id>", methods=["GET"])
@jwt_required()
def get_order(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "订单不存在"}), 404
    can_see_tracking = (
        order.publisher_id == user_id or order.delivery_person_id == user_id
        or user.role in ("admin", "super_admin")
    )
    return jsonify(order.to_dict(include_tracking=can_see_tracking)), 200

@app.route("/api/orders/<int:order_id>/accept", methods=["POST"])
@jwt_required()
def accept_order(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "订单不存在"}), 404
    if order.status != "pending":
        return jsonify({"error": "订单已被接单"}), 400
    if user.role != "delivery":
        return jsonify({"error": "只有接单人才能接单"}), 403
    dp = user.delivery_profile
    if not dp or dp.status != "approved":
        return jsonify({"error": "请先完成实名认证并通过审核"}), 403
    if dp.is_blocked:
        return jsonify({"error": "账号已被限制接单"}), 403
    order.delivery_person_id = user_id
    order.status = "accepted"
    order.updated_at = datetime.datetime.utcnow()
    return jsonify(order.to_dict(include_tracking=True)), 200

@app.route("/api/orders/<int:order_id>/complete", methods=["POST"])
@jwt_required()
def complete_order(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "订单不存在"}), 404
    if order.delivery_person_id != user_id:
        return jsonify({"error": "无权操作此订单"}), 403
    if order.status not in ("accepted", "in_transit"):
        return jsonify({"error": "当前订单状态不允许完成"}), 400
    if "photo" not in request.files:
        return jsonify({"error": "请上传完成照片"}), 400
    photo = request.files["photo"]
    if photo.filename == "" or not allowed_file(photo.filename):
        return jsonify({"error": "请上传有效的图片文件"}), 400
    filename = f"complete_{order_id}_{uuid.uuid4().hex}.{photo.filename.rsplit('.', 1)[1].lower()}"
    photo.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))
    order.completion_photo = filename
    order.status = "completed"
    order.updated_at = datetime.datetime.utcnow()
    if user.delivery_profile:
        user.delivery_profile.total_orders = (user.delivery_profile.total_orders or 0) + 1
    return jsonify(order.to_dict(include_tracking=True)), 200

@app.route("/api/orders/<int:order_id>/cancel", methods=["POST"])
@jwt_required()
def cancel_order(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "订单不存在"}), 404
    if order.publisher_id == user_id and order.status == "pending":
        order.status = "cancelled"
        order.updated_at = datetime.datetime.utcnow()
        db.session.commit()
        return jsonify({"message": "订单已取消"}), 200
    if order.delivery_person_id == user_id and order.status == "accepted":
        order.status = "cancelled"
        order.updated_at = datetime.datetime.utcnow()
        if user.delivery_profile:
            make_warning(user.delivery_profile.id, order_id, "接单后取消订单（违规警告）")
        db.session.commit()
        return jsonify({"message": "订单已取消，已记录警告"}), 200
    return jsonify({"error": "无权取消此订单或当前状态不允许取消"}), 403

@app.route("/api/orders/<int:order_id>/status", methods=["PUT"])
@jwt_required()
def update_order_status(order_id):
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "订单不存在"}), 404
    data = request.get_json()
    new_status = data.get("status")
    if user.role not in ("admin", "super_admin"):
        return jsonify({"error": "无权操作"}), 403
    if new_status in ("in_transit", "disputed"):
        order.status = new_status
        order.updated_at = datetime.datetime.utcnow()
        db.session.commit()
        return jsonify(order.to_dict(include_tracking=True)), 200
    return jsonify({"error": "无效的状态变更"}), 400

# === Delivery ===

@app.route("/api/delivery/apply", methods=["POST"])
@jwt_required()
def apply_delivery():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    if user.delivery_profile and user.delivery_profile.status != "rejected":
        return jsonify({"error": "已提交过认证申请"}), 400
    data = request.form.to_dict()
    for field in ["real_name", "phone", "student_id", "college"]:
        if field not in data or not data[field]:
            return jsonify({"error": f"请填写{field}"}), 400
    photo_url = ""
    if "student_card_photo" in request.files:
        photo = request.files["student_card_photo"]
        if photo.filename and allowed_file(photo.filename):
            filename = f"student_card_{user_id}_{uuid.uuid4().hex}.{photo.filename.rsplit('.', 1)[1].lower()}"
            photo.save(os.path.join(app.config["UPLOAD_FOLDER"], filename))
            photo_url = filename
    if user.delivery_profile:
        dp = user.delivery_profile
        dp.real_name, dp.phone, dp.student_id, dp.college = data["real_name"], data["phone"], data["student_id"], data["college"]
        if photo_url: dp.student_card_photo = photo_url
        dp.status = "pending"
    else:
        dp = DeliveryPerson(user_id=user_id, real_name=data["real_name"], phone=data["phone"],
                            student_id=data["student_id"], college=data["college"],
                            student_card_photo=photo_url, status="pending")
        db.session.add(dp)
    if user.role != "delivery":
        user.role = "delivery"
    return jsonify({"message": "认证申请已提交，请等待审核", "profile": dp.to_dict()}), 201

@app.route("/api/delivery/status", methods=["GET"])
@jwt_required()
def delivery_status():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    if not user.delivery_profile:
        return jsonify({"error": "未提交认证申请", "status": "none"}), 200
    return jsonify(user.delivery_profile.to_dict()), 200

# === Admin ===

@app.route("/api/admin/dashboard", methods=["GET"])
@jwt_required()
@admin_required
def admin_dashboard():
    total_users = User.query.count()
    total_orders = Order.query.count()
    pending_orders = Order.query.filter_by(status="pending").count()
    completed_orders = Order.query.filter_by(status="completed").count()
    pending_approvals = DeliveryPerson.query.filter_by(status="pending").count()
    total_delivery = DeliveryPerson.query.count()
    blocked_delivery = DeliveryPerson.query.filter_by(is_blocked=True).count()
    total_revenue = db.session.query(db.func.sum(Transaction.amount)).filter_by(type="payment", status="success").scalar() or 0
    return jsonify({
        "total_users": total_users, "total_orders": total_orders,
        "pending_orders": pending_orders, "completed_orders": completed_orders,
        "pending_approvals": pending_approvals, "total_delivery": total_delivery,
        "blocked_delivery": blocked_delivery, "total_revenue": float(total_revenue),
    }), 200

@app.route("/api/admin/delivery-persons", methods=["GET"])
@jwt_required()
@admin_required
def admin_delivery_persons():
    status_filter = request.args.get("status")
    query = DeliveryPerson.query
    if status_filter:
        query = query.filter_by(status=status_filter)
    dps = query.order_by(DeliveryPerson.created_at.desc()).all()
    return jsonify([{**dp.to_dict(), "user": dp.user.to_dict() if dp.user else None} for dp in dps]), 200

@app.route("/api/admin/delivery-persons/<int:dp_id>/verify", methods=["POST"])
@jwt_required()
@admin_required
def verify_delivery_person(dp_id):
    dp = DeliveryPerson.query.get(dp_id)
    if not dp:
        return jsonify({"error": "认证申请不存在"}), 404
    data = request.get_json()
    action = data.get("action", "approve")
    if action == "approve":
        dp.status = "approved"
        db.session.commit()
        return jsonify({"message": "已通过认证", "profile": dp.to_dict()}), 200
    elif action == "reject":
        dp.status = "rejected"
        db.session.commit()
        return jsonify({"message": "已拒绝认证", "profile": dp.to_dict()}), 200
    return jsonify({"error": "无效的操作"}), 400

@app.route("/api/admin/warnings", methods=["GET"])
@jwt_required()
@admin_required
def admin_warnings():
    query = Warning.query.order_by(Warning.created_at.desc())
    dp_id = request.args.get("delivery_person_id")
    if dp_id:
        query = query.filter_by(delivery_person_id=dp_id)
    return jsonify([w.to_dict() for w in query.all()]), 200

@app.route("/api/admin/warnings/<int:dp_id>/clear", methods=["POST"])
@jwt_required()
@admin_required
def clear_warnings(dp_id):
    dp = DeliveryPerson.query.get(dp_id)
    if not dp:
        return jsonify({"error": "用户不存在"}), 404
    dp.warning_count = 0
    dp.is_blocked = False
    return jsonify({"message": "警告已清除，接单限制已解除", "profile": dp.to_dict()}), 200

@app.route("/api/admin/users", methods=["GET"])
@jwt_required()
@admin_required
def admin_users():
    users = User.query.order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        d = u.to_dict()
        if u.delivery_profile:
            d["delivery_profile"] = u.delivery_profile.to_dict()
        result.append(d)
    return jsonify(result), 200

@app.route("/api/admin/users/<int:target_id>/block", methods=["POST"])
@jwt_required()
@admin_required
def block_user(target_id):
    user = User.query.get(target_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    user.is_active = False
    return jsonify({"message": "用户已禁用"}), 200

@app.route("/api/admin/users/<int:target_id>/unblock", methods=["POST"])
@jwt_required()
@admin_required
def unblock_user(target_id):
    user = User.query.get(target_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    user.is_active = True
    if user.delivery_profile:
        user.delivery_profile.is_blocked = False
    return jsonify({"message": "用户已解禁"}), 200

@app.route("/api/admin/admins", methods=["GET"])
@jwt_required()
@super_admin_required
def admin_list():
    return jsonify([u.to_dict() for u in User.query.filter(User.role.in_(["admin", "super_admin"])).all()]), 200

@app.route("/api/admin/set-admin", methods=["POST"])
@jwt_required()
@super_admin_required
def set_admin():
    data = request.get_json()
    user = User.query.get(data.get("user_id"))
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    user.role = "admin"
    return jsonify({"message": "已设置为管理员", "user": user.to_dict()}), 200

# === Ratings ===

@app.route("/api/ratings", methods=["POST"])
@jwt_required()
def create_rating():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    order_id = data.get("order_id")
    rating_val = data.get("rating")
    comment = data.get("comment", "")
    if not order_id or not rating_val:
        return jsonify({"error": "请提供订单ID和评分"}), 400
    rating_val = int(rating_val)
    if rating_val < 1 or rating_val > 5:
        return jsonify({"error": "评分范围为1-5"}), 400
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "订单不存在"}), 404
    if order.publisher_id != user_id:
        return jsonify({"error": "只有发布人才能评价"}), 403
    if order.status != "completed":
        return jsonify({"error": "只能在订单完成后评价"}), 400
    if Rating.query.filter_by(order_id=order_id).first():
        return jsonify({"error": "该订单已评价"}), 400

    rating = Rating(order_id=order_id, from_user_id=user_id,
                    to_user_id=order.delivery_person_id, rating=rating_val, comment=comment)
    db.session.add(rating)

    dp = DeliveryPerson.query.filter_by(user_id=order.delivery_person_id).first()
    if dp:
        ratings = Rating.query.filter_by(to_user_id=order.delivery_person_id).all()
        dp.avg_rating = sum(r.rating for r in ratings) / len(ratings) if ratings else 0
    return jsonify(rating.to_dict()), 201

@app.route("/api/ratings/user/<int:target_id>", methods=["GET"])
def user_ratings(target_id):
    ratings = Rating.query.filter_by(to_user_id=target_id).order_by(Rating.created_at.desc()).all()
    return jsonify([r.to_dict() for r in ratings]), 200

# === Disputes ===

@app.route("/api/disputes", methods=["POST"])
@jwt_required()
def create_dispute():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    order_id = data.get("order_id")
    reason = data.get("reason", "")
    if not order_id or not reason:
        return jsonify({"error": "请提供订单ID和申诉原因"}), 400
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "订单不存在"}), 404
    if order.publisher_id != user_id:
        return jsonify({"error": "只有发布人才能申诉"}), 403

    dispute = Dispute(order_id=order_id, user_id=user_id, reason=reason, status="pending")
    db.session.add(dispute)
    order.status = "disputed"
    order.updated_at = datetime.datetime.utcnow()
    return jsonify(dispute.to_dict()), 201

@app.route("/api/disputes", methods=["GET"])
@jwt_required()
def list_disputes():
    user_id = int(get_jwt_identity())
    user = User.query.get(user_id)
    if not user:
        return jsonify({"error": "用户不存在"}), 404
    if user.role in ("admin", "super_admin"):
        disputes = Dispute.query.order_by(Dispute.created_at.desc()).all()
    else:
        disputes = Dispute.query.filter_by(user_id=user_id).order_by(Dispute.created_at.desc()).all()
    return jsonify([d.to_dict() for d in disputes]), 200

@app.route("/api/disputes/<int:dispute_id>/resolve", methods=["POST"])
@jwt_required()
@admin_required
def resolve_dispute(dispute_id):
    dispute = Dispute.query.get(dispute_id)
    if not dispute:
        return jsonify({"error": "申诉不存在"}), 404
    data = request.get_json()
    admin_id = int(get_jwt_identity())
    dispute.status = data.get("status", "resolved")
    dispute.admin_response = data.get("response", "")
    dispute.resolved_by = admin_id
    dispute.resolved_at = datetime.datetime.utcnow()
    order = Order.query.get(dispute.order_id)
    if order:
        order.status = "completed"
        order.updated_at = datetime.datetime.utcnow()
    return jsonify(dispute.to_dict()), 200

# === Payments ===

@app.route("/api/payments/create", methods=["POST"])
@jwt_required()
def create_payment():
    user_id = int(get_jwt_identity())
    data = request.get_json()
    order_id = data.get("order_id")
    if not order_id:
        return jsonify({"error": "请提供订单ID"}), 400
    order = Order.query.get(order_id)
    if not order:
        return jsonify({"error": "订单不存在"}), 404
    if order.publisher_id != user_id:
        return jsonify({"error": "只有发布人才能支付"}), 403
    if order.status != "completed":
        return jsonify({"error": "订单未完成，无法支付"}), 400
    if order.paid:
        return jsonify({"error": "订单已支付"}), 400

    # Simulate WeChat Pay prepay for prototype
    prepay_id = f"wx{datetime.datetime.utcnow().strftime('%Y%m%d%H%M%S')}{uuid.uuid4().hex[:8]}"
    tx = Transaction(order_id=order_id, user_id=user_id, amount=order.price, type="payment", status="pending", wx_prepay_id=prepay_id)
    db.session.add(tx)

    return jsonify({
        "prepay_id": prepay_id,
        "amount": order.price,
        "order_id": order_id,
        "description": f"SUES快递-订单#{order_id}",
        "wx_appid": Config.WX_APPID,
        "wx_mchid": Config.WX_MCHID,
        "notify_url": Config.WX_NOTIFY_URL,
    }), 201

@app.route("/api/payments/notify", methods=["POST"])
def payment_notify():
    data = request.get_json() or {}
    prepay_id = data.get("prepay_id", data.get("out_trade_no", ""))
    wx_transaction_id = data.get("transaction_id", f"wx_sim_{uuid.uuid4().hex[:12]}")
    tx = Transaction.query.filter_by(wx_prepay_id=prepay_id).first()
    if tx:
        tx.status = "success"
        tx.wx_transaction_id = wx_transaction_id
        order = Order.query.get(tx.order_id)
        if order:
            order.paid = True
            order.updated_at = datetime.datetime.utcnow()
        db.session.commit()
    return jsonify({"code": "SUCCESS", "message": "OK"}), 200

@app.route("/api/payments/status/<int:order_id>", methods=["GET"])
@jwt_required()
def payment_status(order_id):
    user_id = int(get_jwt_identity())
    tx = Transaction.query.filter_by(order_id=order_id).first()
    if not tx:
        return jsonify({"status": "none", "paid": False}), 200
    return jsonify(tx.to_dict()), 200

# === Uploads ===

@app.route("/api/uploads/<filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


# === Frontend static file serving ===
FRONTEND_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "frontend")

@app.route("/")
def frontend_index():
    if request.path.startswith("/api/"):
        return jsonify({"error": "API endpoint"}), 404
    import io
    index_path = os.path.join(FRONTEND_DIR, "index.html")
    with open(index_path, "r", encoding="utf-8") as f:
        return f.read()

@app.route("/css/<path:filename>")
def frontend_css(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, "css"), filename)

@app.route("/js/<path:filename>")
def frontend_js(filename):
    return send_from_directory(os.path.join(FRONTEND_DIR, "js"), filename)
# === Start ===

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)






