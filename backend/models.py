import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)
    role = db.Column(db.String(20), nullable=False, default="publisher")
    phone = db.Column(db.String(20))
    is_active = db.Column(db.Boolean, default=True)
    is_blocked = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    orders_published = db.relationship("Order", foreign_keys="Order.publisher_id", backref="publisher", lazy="dynamic")
    orders_accepted = db.relationship("Order", foreign_keys="Order.delivery_person_id", backref="delivery_person", lazy="dynamic")
    delivery_profile = db.relationship("DeliveryPerson", uselist=False, backref="user", lazy="joined")

    def set_password(self, password):
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        return check_password_hash(self.password_hash, password)

    def to_dict(self):
        return {
            "id": self.id,
            "username": self.username,
            "role": self.role,
            "phone": self.phone,
            "is_active": self.is_active,
            "is_blocked": self.is_blocked,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class DeliveryPerson(db.Model):
    __tablename__ = "delivery_persons"
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False, unique=True)
    real_name = db.Column(db.String(50), nullable=False)
    phone = db.Column(db.String(20), nullable=False)
    student_id = db.Column(db.String(30), nullable=False)
    college = db.Column(db.String(100), nullable=False)
    student_card_photo = db.Column(db.String(256))
    status = db.Column(db.String(20), default="pending")
    warning_count = db.Column(db.Integer, default=0)
    is_blocked = db.Column(db.Boolean, default=False)
    total_orders = db.Column(db.Integer, default=0)
    avg_rating = db.Column(db.Float, default=0.0)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    warnings = db.relationship("Warning", backref="delivery_person", lazy="dynamic")

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "real_name": self.real_name,
            "phone": self.phone,
            "student_id": self.student_id,
            "college": self.college,
            "student_card_photo": self.student_card_photo,
            "status": self.status,
            "warning_count": self.warning_count,
            "is_blocked": self.is_blocked,
            "total_orders": self.total_orders,
            "avg_rating": self.avg_rating,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Order(db.Model):
    __tablename__ = "orders"
    id = db.Column(db.Integer, primary_key=True)
    publisher_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    delivery_person_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=True)
    tracking_number = db.Column(db.String(100), nullable=False)
    pickup_address = db.Column(db.String(200), nullable=False)
    pickup_code = db.Column(db.String(50), nullable=False)
    delivery_address = db.Column(db.String(200), nullable=False)
    package_size = db.Column(db.String(20), nullable=False)
    weight = db.Column(db.Float, default=0.0)
    price = db.Column(db.Float, nullable=False)
    status = db.Column(db.String(20), default="pending")
    completion_photo = db.Column(db.String(256))
    notes = db.Column(db.Text)
    paid = db.Column(db.Boolean, default=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)

    rating = db.relationship("Rating", uselist=False, backref="order", lazy="joined")
    disputes = db.relationship("Dispute", backref="order", lazy="dynamic")
    transaction = db.relationship("Transaction", uselist=False, backref="order", lazy="joined")

    def to_dict(self, include_tracking=False):
        data = {
            "id": self.id,
            "publisher_id": self.publisher_id,
            "delivery_person_id": self.delivery_person_id,
            "pickup_address": self.pickup_address,
            "pickup_code": self.pickup_code if include_tracking else "***",
            "delivery_address": self.delivery_address,
            "package_size": self.package_size,
            "weight": self.weight,
            "price": self.price,
            "status": self.status,
            "completion_photo": self.completion_photo,
            "notes": self.notes,
            "paid": self.paid,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
        }
        if include_tracking:
            data["tracking_number"] = self.tracking_number
        else:
            masked = self.tracking_number[:4] + "****" if len(self.tracking_number) > 4 else "****"
            data["tracking_number"] = masked
        # Add delivery person info
        if self.delivery_person_id:
            dp_user = db.session.get(User, self.delivery_person_id)
            if dp_user and dp_user.delivery_profile:
                data["delivery_person_name"] = dp_user.delivery_profile.real_name
        return data


class Rating(db.Model):
    __tablename__ = "ratings"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    from_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    to_user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    rating = db.Column(db.Integer, nullable=False)
    comment = db.Column(db.Text)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "from_user_id": self.from_user_id,
            "to_user_id": self.to_user_id,
            "rating": self.rating,
            "comment": self.comment,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Dispute(db.Model):
    __tablename__ = "disputes"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    reason = db.Column(db.Text, nullable=False)
    status = db.Column(db.String(20), default="pending")
    admin_response = db.Column(db.Text)
    resolved_by = db.Column(db.Integer, db.ForeignKey("users.id"))
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)
    resolved_at = db.Column(db.DateTime)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "user_id": self.user_id,
            "reason": self.reason,
            "status": self.status,
            "admin_response": self.admin_response,
            "resolved_by": self.resolved_by,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
        }


class Warning(db.Model):
    __tablename__ = "warnings"
    id = db.Column(db.Integer, primary_key=True)
    delivery_person_id = db.Column(db.Integer, db.ForeignKey("delivery_persons.id"), nullable=False)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=True)
    reason = db.Column(db.String(200), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "delivery_person_id": self.delivery_person_id,
            "order_id": self.order_id,
            "reason": self.reason,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Transaction(db.Model):
    __tablename__ = "transactions"
    id = db.Column(db.Integer, primary_key=True)
    order_id = db.Column(db.Integer, db.ForeignKey("orders.id"), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey("users.id"), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    type = db.Column(db.String(20), nullable=False)
    status = db.Column(db.String(20), default="pending")
    wx_transaction_id = db.Column(db.String(100))
    wx_prepay_id = db.Column(db.String(100))
    created_at = db.Column(db.DateTime, default=datetime.datetime.utcnow)

    def to_dict(self):
        return {
            "id": self.id,
            "order_id": self.order_id,
            "user_id": self.user_id,
            "amount": self.amount,
            "type": self.type,
            "status": self.status,
            "wx_transaction_id": self.wx_transaction_id,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }

