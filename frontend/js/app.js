console.log('SCRIPT_START');
const API_URL = 'http://localhost:5000/api';
let state = { user: null, token: null, role: null, currentDetail: null };


// Make all functions accessible as globals
window.showAuth = showAuth;
window.showPage = showPage;  
window.handleAuth = handleAuth;
window.logout = logout;
window.showEntry = showEntry;
window.navigateTo = navigateTo;
window.closeDetail = closeDetail;
window.showToast = showToast;
window.toggleAuthMode = toggleAuthMode;
window.publishOrder = publishOrder;
window.switchPubTab = switchPubTab;
window.loadMyOrders = loadMyOrders;
window.filterMyOrders = filterMyOrders;
window.checkDeliveryStatus = checkDeliveryStatus;
window.submitDeliveryApply = submitDeliveryApply;
window.previewPhoto = previewPhoto;
window.switchDelTab = switchDelTab;
window.loadAvailableOrders = loadAvailableOrders;
window.loadMyDeliveries = loadMyDeliveries;
window.filterMyDeliveries = filterMyDeliveries;
window.acceptOrder = acceptOrder;
window.renderOrderItem = renderOrderItem;
window.showOrderDetail = showOrderDetail;
window.completeOrder = completeOrder;
window.cancelOrder = cancelOrder;
window.showRatingForm = showRatingForm;
window.setRating = setRating;
window.submitRating = submitRating;
window.closeModal = closeModal;
window.showDisputeForm = showDisputeForm;
window.submitDispute = submitDispute;
window.payOrder = payOrder;
window.confirmPay = confirmPay;
window.loadAdminDashboard = loadAdminDashboard;
window.switchAdminTab = switchAdminTab;
window.loadAdminVerify = loadAdminVerify;
window.verifyDelivery = verifyDelivery;
window.loadAdminOrders = loadAdminOrders;
window.loadAdminUsers = loadAdminUsers;
window.adminBlockUser = adminBlockUser;
window.adminUnblockUser = adminUnblockUser;
window.clearWarnings = clearWarnings;
window.setAsAdmin = setAsAdmin;
window.resolveDispute = resolveDispute;
window.adminCancelOrder = adminCancelOrder;

window.onload = function() { showPage('page-entry'); };
const TOKEN_KEY = 'sues_express_token';
const USER_KEY = 'sues_express_user';

// Initialize at top level (DOM is ready since script is at end of body)
try {
    var saved = localStorage.getItem(TOKEN_KEY);
    var userData = localStorage.getItem(USER_KEY);
    if (saved && userData) {
        state.token = saved;
        state.user = JSON.parse(userData);
        state.role = state.user.role;
        if (state.role === 'publisher') { showPage('page-publisher'); loadMyOrders(); }
        else if (state.role === 'delivery') { showPage('page-delivery'); checkDeliveryStatus(); }
        else if (['admin','super_admin'].includes(state.role)) { showPage('page-admin'); loadAdminDashboard(); }
        else showEntry();
    }
} catch(e) {}
try {
    var pw = document.getElementById('pub-weight');
    if (pw) pw.addEventListener('input', updatePricePreview);
    var loginBtn = document.getElementById('auth-submit-btn');
    if (loginBtn) loginBtn.addEventListener('click', handleAuth);
} catch(e) {}



function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById(pageId).style.display = 'block';
}

function showAuth(role) {
  console.log('SHOW_AUTH_CALLED role=' + role);
  document.getElementById('auth-target-role').value = role;
  showPage('page-auth');
}

async function handleAuth() { console.log('handleAuth called');
  console.log('HANDLE_AUTH_CALLED');
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  if (!username || !password) { alert('请填写用户名和密码'); return; }
  if (password.length < 6) { alert('密码至少需要6位'); return; }
  
  const role = document.getElementById('auth-target-role').value;
  const isLogin = document.getElementById('auth-mode').value === 'login';
  
  try {
    let data;
    if (isLogin) {
      data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, login_role: role }) });
    } else {
      data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    }
    alert((isLogin ? '登录' : '注册') + '成功!');
    state.user = data.user;
    state.token = data.token;
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    if (role === 'publisher') showPage('page-publisher');
    else if (role === 'delivery') showPage('page-delivery');
    else showPage('page-admin');
  } catch(e) { alert(e.message); }
}

async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API_URL + path, { ...options, headers });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

function logout() {
  state = { user: null, token: null, role: null };
  localStorage.clear();
  showPage('page-entry');
}

// Make functions global
window.showAuth = showAuth;
window.handleAuth = handleAuth;
window.logout = logout;
window.showAuth = showAuth;
window.handleAuth = handleAuth;
window.logout = logout;
// ==== Publisher Functions ====
function updatePricePreview() {
  const weight = parseFloat(document.getElementById('pub-weight').value) || 0;
  let price;
  if (weight <= 0.5) price = 2;
  else if (weight <= 1) price = 4;
  else if (weight <= 2) price = 6;
  else if (weight <= 5) price = 10;
  else price = 10 + (weight - 5) * 2;
  document.getElementById('pub-price-amount').textContent = price.toFixed(2);
  const pt = document.getElementById('pub-payment-type');
  if (pt) pt.innerHTML = price < 10 ? '[COD]' : '[PREPAY]';
}
async function publishOrder() {
  const fields = { pickup_address: 'pub-pickup-addr', pickup_code: 'pub-pickup-code',
    delivery_address: 'pub-delivery-addr', tracking_number: 'pub-tracking' };
  const data = {};
  for (const [k, id] of Object.entries(fields)) {
    const val = document.getElementById(id).value.trim();
    if (!val) { showToast('请填写所有必填信息'); return; }
    data[k] = val;
  }
  data.weight = parseFloat(document.getElementById('pub-weight').value) || 0;
  data.notes = document.getElementById('pub-notes').value.trim();
  try {
    await api('/orders', { method: 'POST', body: JSON.stringify(data) });
    showToast('订单发布成功');
    for (const id of Object.values(fields)) document.getElementById(id).value = '';
    document.getElementById('pub-weight').value = '';
    document.getElementById('pub-notes').value = '';
    updatePricePreview();
    switchPubTab('myorders'); loadMyOrders();
  } catch(e) { showToast(e.message); }
}
function switchPubTab(tab) {
  document.querySelectorAll('#page-publisher .page-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('pub-publish').style.display = tab === 'publish' ? 'block' : 'none';
  document.getElementById('pub-myorders').style.display = tab === 'myorders' ? 'block' : 'none';
  const tabs = document.querySelectorAll('#page-publisher .page-tab');
  if (tab === 'publish') tabs[0].classList.add('active'); else tabs[1].classList.add('active');
  if (tab === 'myorders') loadMyOrders();
}
async function loadMyOrders(status) {
  const c = document.getElementById('pub-orders-list');
  try {
    const url = status && status !== 'all' ? '/orders?status=' + status : '/orders';
    const orders = await api(url);
    if (!orders.length) { c.innerHTML = '<div class="empty-state"><div class="icon">📭</div><p>暂无订单</p></div>'; return; }
    c.innerHTML = orders.map(o => renderOrderItem(o, 'publisher')).join('');
  } catch(e) { c.innerHTML = '<div class="empty-state"><p>' + e.message + '</p></div>'; }
}
function filterMyOrders(status, el) {
  document.querySelectorAll('#pub-myorders .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); loadMyOrders(status);
}
function filterMyOrders(status, el) {
  document.querySelectorAll('#pub-myorders .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); loadMyOrders(status);
}
// ==== Constants and Utilities ====
const statusLabels = { pending: '待接单', accepted: '已接单', in_transit: '配送中', completed: '已完成', cancelled: '已取消', disputed: '申诉中' };
const sizeLabels = { small: '小件', medium: '中件', large: '大件', xlarge: '超大件' };
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg; t.classList.remove('show'); void t.offsetWidth;
  t.classList.add('show'); setTimeout(() => t.classList.remove('show'), 2000);
}
function closeDetail() {
  if (state.role === 'publisher') showPage('page-publisher');
  else if (state.role === 'delivery') showPage('page-delivery');
  else showPage('page-admin');
}
// ==== Delivery Functions ====
let deliveryVerified = false;
async function checkDeliveryStatus() {
  try {
    const dp = await api('/delivery/status');
    deliveryVerified = dp.status === 'approved';
    if (dp.status === 'none') showDeliveryApplyForm();
    else if (dp.status === 'pending') {
      document.getElementById('del-orders-list').innerHTML = '<div class="card"><p style="text-align:center;color:var(--warning);">⏳ 实名认证审核中，请耐心等待</p></div>';
    } else if (dp.status === 'rejected') showDeliveryApplyForm('认证被拒绝，请重新提交');
    else if (dp.status === 'approved') {
      if (dp.is_blocked) {
        document.getElementById('del-orders-list').innerHTML = '<div class="card"><p style="text-align:center;color:var(--danger);">⚠️ 已被限制接单（警告' + dp.warning_count + '/3次）<br>请联系管理员解除</p></div>';
      }
      loadAvailableOrders();
    }
  } catch(e) { showDeliveryApplyForm(); }
}
function showDeliveryApplyForm(msg) {
  document.getElementById('del-orders-list').innerHTML =
    '<div class="card">' + (msg ? '<p style="color:var(--danger);margin-bottom:12px;">' + msg + '</p>' : '') +
    '<div class="form-group"><label>真实姓名</label><input type="text" id="del-real-name" placeholder="姓名"></div>' +
    '<div class="form-group"><label>手机号</label><input type="tel" id="del-phone" placeholder="手机号"></div>' +
    '<div class="form-group"><label>学号</label><input type="text" id="del-student-id" placeholder="学号"></div>' +
    '<div class="form-group"><label>学院</label><input type="text" id="del-college" placeholder="学院"></div>' +
    '<div class="form-group"><label>学生证照片</label>' +
    '<div class="photo-upload" onclick="document.getElementById(\'del-photo-input\').click()">' +
    '<span class="icon">📷</span><span class="text">点击上传学生证照片</span>' +
    '<img id="del-photo-preview" class="photo-preview" style="display:none"></div>' +
    '<input type="file" id="del-photo-input" accept="image/*" style="display:none" onchange="previewPhoto(this,\'del-photo-preview\')">' +
    '</div><button class="btn btn-primary btn-block" onclick="submitDeliveryApply()">提交认证</button></div>';
}
function previewPhoto(input, id) {
  const preview = document.getElementById(id);
  if (input.files && input.files[0]) {
    const r = new FileReader();
    r.onload = e => { preview.src = e.target.result; preview.style.display = 'block'; };
    r.readAsDataURL(input.files[0]);
  }
}
async function submitDeliveryApply() {
  const fields = { real_name: 'del-real-name', phone: 'del-phone', student_id: 'del-student-id', college: 'del-college' };
  for (const [k, id] of Object.entries(fields)) { if (!document.getElementById(id).value.trim()) { showToast('请填写所有信息'); return; } }
  const pi = document.getElementById('del-photo-input');
  if (!pi.files || !pi.files[0]) { showToast('请上传学生证照片'); return; }
  const fd = new FormData();
  for (const [k, id] of Object.entries(fields)) fd.append(k, document.getElementById(id).value.trim());
  fd.append('student_card_photo', pi.files[0]);
  try { await apiForm('/delivery/apply', fd); showToast('认证申请已提交'); checkDeliveryStatus(); }
  catch(e) { showToast(e.message); }
}
function switchDelTab(tab) {
  document.querySelectorAll('#page-delivery .page-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('del-available').style.display = tab === 'available' ? 'block' : 'none';
  document.getElementById('del-mine').style.display = tab === 'mine' ? 'block' : 'none';
  const tabs = document.querySelectorAll('#page-delivery .page-tab');
  if (tab === 'available') { tabs[0].classList.add('active'); loadAvailableOrders(); }
  else { tabs[1].classList.add('active'); loadMyDeliveries(); }
}
async function loadAvailableOrders() {
  const c = document.getElementById('del-orders-list');
  try {
    const orders = await api('/orders/available');
    if (!orders.length) { c.innerHTML = '<div class="empty-state"><div class="icon">🔍</div><p>暂无可用订单</p></div>'; return; }
    c.innerHTML = orders.map(o => renderOrderItem(o, 'delivery')).join('');
  } catch(e) { c.innerHTML = '<div class="empty-state"><p>' + e.message + '</p></div>'; }
}
async function loadMyDeliveries(status) {
  const c = document.getElementById('del-mine-list');
  try {
    const url = status && status !== 'all' ? '/orders?status=' + status : '/orders?status=mine';
    const orders = await api(url);
    if (!orders.length) { c.innerHTML = '<div class="empty-state"><div class="icon">📋</div><p>暂无接单记录</p></div>'; return; }
    c.innerHTML = orders.map(o => renderOrderItem(o, 'delivery')).join('');
  } catch(e) { c.innerHTML = '<div class="empty-state"><p>' + e.message + '</p></div>'; }
}
function filterMyDeliveries(status, el) {
  document.querySelectorAll('#del-mine .filter-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active'); loadMyDeliveries(status);
}
async function acceptOrder(id) {
  try { await api('/orders/' + id + '/accept', { method: 'POST' }); showToast('接单成功！可查看完整快递编号');
    loadAvailableOrders(); loadMyDeliveries(); } catch(e) { showToast(e.message); }
}
// ==== Render Functions ====
function renderOrderItem(order, role) {
  const cls = 'status-' + order.status;
  const ps = order.pickup_address.length > 12 ? order.pickup_address.slice(0,12)+'...' : order.pickup_address;
  const ds = order.delivery_address.length > 12 ? order.delivery_address.slice(0,12)+'...' : order.delivery_address;
  const acceptBtn = (role === 'delivery' && order.status === 'pending')
    ? '<button class="btn btn-sm btn-primary" style="margin-top:6px;" onclick="event.stopPropagation();acceptOrder('+order.id+')">接单</button>' : '';
  return '<div class="order-item" onclick="showOrderDetail('+order.id+')">' +
    '<div class="top-row"><span class="route">' + ps + ' → ' + ds + '</span><span class="price">¥' + order.price.toFixed(2) + '</span></div>' +
    '<div class="meta"><span>大小 ' + (sizeLabels[order.package_size]||order.package_size) + '</span><span>单号 ' + order.tracking_number + '</span><span class="' + cls + '">' + (statusLabels[order.status]||order.status) + '</span></div>' +
    acceptBtn + '</div>';
}
// ==== Order Detail Functions ====
async function showOrderDetail(id) {
  try {
    const order = await api('/orders/' + id);
    state.currentDetail = order;
    showPage('page-order-detail');
    const c = document.getElementById('order-detail-content');
    const canSee = !order.tracking_number.includes('****');
    let actions = '';
    if (state.role === 'delivery' && order.status === 'pending' && deliveryVerified)
      actions += '<button class="btn btn-primary btn-block" onclick="acceptOrder(' + order.id + ')">接单</button>';
    if (state.role === 'delivery' && order.delivery_person_id === state.user.id && ['accepted','in_transit'].includes(order.status))
      actions += getCompleteFormHTML(order.id);
    if (state.role === 'delivery' && order.delivery_person_id === state.user.id && order.status === 'accepted')
      actions += '<button class="btn btn-danger btn-block mt-8" onclick="cancelOrder(' + order.id + ')">取消接单</button>';
    if (state.role === 'publisher' && order.publisher_id === state.user.id && order.status === 'pending')
      actions += '<button class="btn btn-danger btn-block" onclick="cancelOrder(' + order.id + ')">取消订单</button>';
    if (state.role === 'publisher' && order.publisher_id === state.user.id && order.status === 'completed' && !order.rating)
      actions += '<button class="btn btn-primary btn-block" onclick="showRatingForm(' + order.id + ')">评价接单人</button>';
    if (state.role === 'publisher' && order.publisher_id === state.user.id && order.status === 'completed' && !order.paid)
      actions += '<button class="btn btn-primary btn-block mt-8" onclick="payOrder(' + order.id + ',' + order.price + ')">支付 ¥' + order.price.toFixed(2) + '</button>';
    if (state.role === 'publisher' && order.publisher_id === state.user.id && order.status === 'completed' && order.paid)
      actions += '<div class="card" style="background:var(--green-light);text-align:center;color:var(--green);">✅ 已支付</div>';
    if (state.role === 'publisher' && order.publisher_id === state.user.id && order.status === 'completed')
      actions += '<button class="btn btn-outline btn-block mt-8" onclick="showDisputeForm(' + order.id + ')">发起申诉</button>';
    if (state.role === 'publisher' && order.publisher_id === state.user.id && order.status === 'disputed')
      actions += '<div class="card" style="background:#FFF3E0;text-align:center;">⏳ 正在申诉处理中</div>';
    if (['admin','super_admin'].includes(state.role) && order.status === 'disputed')
      actions += '<button class="btn btn-primary btn-block mt-8" onclick="resolveDispute(' + order.id + ')">处理申诉</button>';
    if (['admin','super_admin'].includes(state.role) && ['accepted','in_transit'].includes(order.status))
      actions += '<button class="btn btn-outline btn-block mt-8" onclick="adminCancelOrder(' + order.id + ')">管理员取消订单</button>';

    c.innerHTML = '<div class="card">' +
      '<div class="detail-row"><span class="label">状态</span><span class="value"><span class="status-badge ' + cls + '">' + (statusLabels[order.status]||order.status) + '</span></span></div>' +
      '<div class="detail-row"><span class="label">取件地址</span><span class="value">' + order.pickup_address + '</span></div>' +
      '<div class="detail-row"><span class="label">取件码</span><span class="value">' + (canSee ? order.pickup_code : '🔒 接单后可见') + '</span></div>' +
      '<div class="detail-row"><span class="label">送达地址</span><span class="value">' + order.delivery_address + '</span></div>' +
      '<div class="detail-row"><span class="label">快递编号</span><span class="value">' + (canSee ? order.tracking_number : '🔒 接单后可见') + '</span></div>' +
      '<div class="detail-row"><span class="label">包裹大小</span><span class="value">' + (sizeLabels[order.package_size]||order.package_size) + '</span></div>' +
      '<div class="detail-row"><span class="label">重量</span><span class="value">' + order.weight + 'kg</span></div>' +
      '<div class="detail-row"><span class="label">价格</span><span class="value" style="font-weight:700;color:var(--danger)">¥' + order.price.toFixed(2) + '</span></div>' +
      (order.delivery_person_name ? '<div class="detail-row"><span class="label">接单人</span><span class="value">' + order.delivery_person_name + '</span></div>' : '') +
      (order.notes ? '<div class="detail-row"><span class="label">备注</span><span class="value">' + order.notes + '</span></div>' : '') +
      '<div class="detail-row"><span class="label">创建时间</span><span class="value">' + (order.created_at||'') + '</span></div>' +
      (order.completion_photo ? '<div class="detail-row"><span class="label">完成照片</span><span class="value"><img src="' + API_URL + '/uploads/' + order.completion_photo + '" style="max-width:100%;border-radius:8px;"></span></div>' : '') +
      (order.rating ? '<div class="detail-row"><span class="label">评价</span><span class="value">' + '⭐'.repeat(order.rating.rating) + ' ' + (order.rating.comment||'') + '</span></div>' : '') +
      '</div>' + (actions ? '<div class="detail-actions">' + actions + '</div>' : '');
  } catch(e) { showToast(e.message); }
}
function getCompleteFormHTML(orderId) {
  return '<div class="card" style="margin-top:8px;">' +
    '<p style="font-size:13px;margin-bottom:8px;">📸 请上传宿舍楼下照片作为完成证明</p>' +
    '<div class="photo-upload" onclick="document.getElementById(\'complete-photo-input\').click()">' +
    '<span class="icon">📷</span><span class="text">点击拍照/上传</span>' +
    '<img id="complete-photo-preview" class="photo-preview" style="display:none"></div>' +
    '<input type="file" id="complete-photo-input" accept="image/*" style="display:none" onchange="previewPhotoComplete(this)">' +
    '<button class="btn btn-primary btn-block mt-8" onclick="completeOrder(' + orderId + ')">确认完成</button></div>';
}
let completePhotoFile = null;
function previewPhotoComplete(input) {
  if (input.files && input.files[0]) {
    completePhotoFile = input.files[0];
    const r = new FileReader();
    r.onload = e => { document.getElementById('complete-photo-preview').src = e.target.result;
      document.getElementById('complete-photo-preview').style.display = 'block'; };
    r.readAsDataURL(input.files[0]);
  }
}
async function completeOrder(orderId) {
  if (!completePhotoFile) { showToast('请先上传完成照片'); return; }
  const fd = new FormData(); fd.append('photo', completePhotoFile);
  try { await apiForm('/orders/' + orderId + '/complete', fd); showToast('订单已完成！');
    completePhotoFile = null; loadMyDeliveries(); showOrderDetail(orderId);
  } catch(e) { showToast(e.message); }
}
async function cancelOrder(orderId) {
  if (!confirm('确定要取消此订单吗？接单后取消将会记录警告！')) return;
  try { const res = await api('/orders/' + orderId + '/cancel', { method: 'POST' }); showToast(res.message||'已取消'); closeDetail(); }
  catch(e) { showToast(e.message); }
}
// ==== Rating Functions ====
let currentRating = 0;
function showRatingForm(orderId) {
  currentRating = 0;
  document.getElementById('modal-body').innerHTML = '<h3 style="margin-bottom:12px;">评价接单人</h3>' +
    '<div class="star-rating" id="rating-stars">' +
    [1,2,3,4,5].map(i => '<span class="star" data-val="' + i + '" onclick="setRating(' + i + ')">★</span>').join('') +
    '</div><div class="form-group"><label>评价内容</label><textarea id="rating-comment" placeholder="说说你的体验..." rows="3"></textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="submitRating(' + orderId + ')">提交评价</button></div>';
  document.getElementById('modal').classList.add('active');
}
function setRating(val) {
  currentRating = val;
  document.querySelectorAll('#rating-stars .star').forEach(s => {
    s.classList.toggle('active', parseInt(s.dataset.val) <= val);
  });
}
async function submitRating(orderId) {
  if (!currentRating) { showToast('请选择星级评分'); return; }
  const comment = document.getElementById('rating-comment').value.trim();
  try { await api('/ratings', { method: 'POST', body: JSON.stringify({ order_id: orderId, rating: currentRating, comment }) });
    showToast('评价成功'); closeModal(); showOrderDetail(orderId);
  } catch(e) { showToast(e.message); }
}
function closeModal() { document.getElementById('modal').classList.remove('active'); }
// ==== Dispute Functions ====
function showDisputeForm(orderId) {
  document.getElementById('modal-body').innerHTML = '<h3 style="margin-bottom:12px;">发起申诉</h3>' +
    '<div class="form-group"><label>申诉原因</label><textarea id="dispute-reason" placeholder="请详细描述问题..." rows="4"></textarea></div>' +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-danger" onclick="submitDispute(' + orderId + ')">提交申诉</button></div>';
  document.getElementById('modal').classList.add('active');
}
async function submitDispute(orderId) {
  const reason = document.getElementById('dispute-reason').value.trim();
  if (!reason) { showToast('请填写申诉原因'); return; }
  try { await api('/disputes', { method: 'POST', body: JSON.stringify({ order_id: orderId, reason }) });
    showToast('申诉已提交，等待管理员处理'); closeModal(); showOrderDetail(orderId);
  } catch(e) { showToast(e.message); }
}
// ==== Payment Functions ====
async function payOrder(orderId, amount) {
  document.getElementById('modal-body').innerHTML = '<h3 style="margin-bottom:12px;">确认支付</h3>' +
    '<p style="text-align:center;font-size:24px;font-weight:700;color:var(--danger);margin:16px 0;">¥' + amount.toFixed(2) + '</p>' +
    '<p style="text-align:center;font-size:13px;color:var(--text-secondary);margin-bottom:16px;">💳 微信支付<br>第一版支持真实微信支付</p>' +
    '<div class="modal-actions"><button class="btn btn-outline" onclick="closeModal()">取消</button>' +
    '<button class="btn btn-primary" onclick="confirmPay(' + orderId + ',' + amount + ')">确认支付 ¥' + amount.toFixed(2) + '</button></div>';
  document.getElementById('modal').classList.add('active');
}
async function confirmPay(orderId, amount) {
  try {
    const payData = await api('/payments/create', { method: 'POST', body: JSON.stringify({ order_id: orderId }) });
    showToast('正在调起微信支付...');
    setTimeout(async () => {
      try {
        await api('/payments/notify', { method: 'POST', body: JSON.stringify({
          prepay_id: payData.prepay_id, out_trade_no: payData.prepay_id,
          transaction_id: 'wx_sim_' + Date.now()
        })});
        showToast('支付成功！'); closeModal(); showOrderDetail(orderId);
      } catch(e) { showToast(e.message); }
    }, 1500);
  } catch(e) { showToast(e.message); }
}


// ==== Admin Functions ====
async function loadAdminDashboard() {
  try {
    const stats = await api('/admin/dashboard');
    document.getElementById('admin-stats').innerHTML =
      '<div class="stat-card"><div class="number">' + stats.total_orders + '</div><div class="label">总订单</div></div>' +
      '<div class="stat-card"><div class="number">' + stats.pending_orders + '</div><div class="label">待接单</div></div>' +
      '<div class="stat-card"><div class="number">' + stats.completed_orders + '</div><div class="label">已完成</div></div>' +
      '<div class="stat-card"><div class="number">' + stats.total_delivery + '</div><div class="label">接单人</div></div>' +
      '<div class="stat-card"><div class="number" style="color:var(--warning)">' + stats.pending_approvals + '</div><div class="label">待审核</div></div>' +
      '<div class="stat-card"><div class="number" style="color:var(--danger)">' + stats.blocked_delivery + '</div><div class="label">已限制</div></div>';
    document.getElementById('admin-dash-content').innerHTML =
      '<div class="card"><p style="font-size:13px;color:var(--text-secondary);">管理员提示：</p>' +
      '<ul style="margin-top:8px;font-size:13px;line-height:1.8;padding-left:16px;">' +
      '<li>🔍 审核认证审核中的实名认证申请</li><li>📊 在订单管理中查看所有订单</li>' +
      '<li>👥 在用户管理中管理用户和解除接单限制</li></ul></div>';
  } catch(e) { showToast(e.message); }
}
function switchAdminTab(tab, el) {
  document.querySelectorAll('#page-admin .page-tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  ['admin-dashboard','admin-verify','admin-orders','admin-users'].forEach(id => document.getElementById(id).style.display = 'none');
  document.getElementById('admin-' + tab).style.display = 'block';
  if (tab === 'verify') loadAdminVerify();
  else if (tab === 'orders') loadAdminOrders();
  else if (tab === 'users') loadAdminUsers();
}
async function loadAdminVerify() {
  const c = document.getElementById('admin-verify-list');
  try {
    const dps = await api('/admin/delivery-persons?status=pending');
    if (!dps.length) { c.innerHTML = '<div class="card"><p style="text-align:center;color:var(--text-secondary);">✅ 暂无待审核的认证申请</p></div>'; return; }
    c.innerHTML = dps.map(dp =>
      '<div class="card">' +
      '<div class="detail-row"><span class="label">姓名</span><span class="value">' + dp.real_name + '</span></div>' +
      '<div class="detail-row"><span class="label">手机</span><span class="value">' + dp.phone + '</span></div>' +
      '<div class="detail-row"><span class="label">学号</span><span class="value">' + dp.student_id + '</span></div>' +
      '<div class="detail-row"><span class="label">学院</span><span class="value">' + dp.college + '</span></div>' +
      (dp.student_card_photo ? '<div class="detail-row"><span class="label">学生证</span><span class="value"><img src="' + API_URL + '/uploads/' + dp.student_card_photo + '" style="max-width:100%;border-radius:8px;max-height:150px;"></span></div>' : '') +
      '<div style="display:flex;gap:8px;margin-top:12px;">' +
      '<button class="btn btn-primary btn-sm" onclick="verifyDelivery(' + dp.id + ",'" + "approve" + "')" + '">✅ 通过</button>' +
      '<button class="btn btn-danger btn-sm" onclick="verifyDelivery(' + dp.id + ",'" + "reject" + "')" + '">❌ 拒绝</button></div></div>'
    ).join('');
  } catch(e) { c.innerHTML = '<div class="card"><p>' + e.message + '</p></div>'; }
}
async function verifyDelivery(dpId, action) {
  try { await api('/admin/delivery-persons/' + dpId + '/verify', { method: 'POST', body: JSON.stringify({ action }) });
    showToast(action === 'approve' ? '已通过认证' : '已拒绝认证'); loadAdminVerify();
  } catch(e) { showToast(e.message); }
}
async function loadAdminOrders() {
  const c = document.getElementById('admin-orders-list');
  try {
    const orders = await api('/orders');
    if (!orders.length) { c.innerHTML = '<div class="card"><p style="text-align:center;color:var(--text-secondary);">暂无订单</p></div>'; return; }
    c.innerHTML = '<div class="table-wrap"><table><tr><th>ID</th><th>地址</th><th>大小</th><th>价格</th><th>状态</th><th>操作</th></tr>' +
      orders.map(o => '<tr><td>#' + o.id + '</td><td>' + (o.pickup_address.slice(0,8)) + '...</td><td>' + (sizeLabels[o.package_size]||o.package_size) + '</td><td>¥' + o.price.toFixed(2) + '</td><td><span class="status-' + o.status + '">' + (statusLabels[o.status]||o.status) + '</span></td><td><button class="btn btn-sm btn-outline" onclick="showOrderDetail(' + o.id + ')">详情</button></td></tr>').join('') +
      '</table></div>';
  } catch(e) { c.innerHTML = '<div class="card"><p>' + e.message + '</p></div>'; }
}
async function loadAdminUsers() {
  const c = document.getElementById('admin-users-list');
  try {
    const users = await api('/admin/users');
    c.innerHTML = users.map(u => {
      const dp = u.delivery_profile;
      const wc = dp ? dp.warning_count : 0;
      const bl = dp ? dp.is_blocked : false;
      return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;">' +
        '<div><strong>' + u.username + '</strong><span class="status-badge" style="background:#E3F2FD;color:#1565C0;margin-left:8px;">' + u.role + '</span></div>' +
        '<div>' + (!u.is_active ? '<span class="status-badge status-cancelled">已禁用</span>' : '') + (bl ? '<span class="status-badge status-cancelled">限制中(' + wc + '/3)</span>' : '') + '</div></div>' +
        (dp ? '<div style="font-size:13px;color:var(--text-secondary);margin-top:8px;">' + dp.real_name + ' · ' + dp.college + ' · ' + dp.student_id +
        '<span class="status-badge" style="margin-left:4px;">' + (dp.status === 'approved' ? '✅已认证' : dp.status === 'pending' ? '⏳审核中' : '❌已拒绝') + '</span>' +
        '<span style="margin-left:8px;">接单' + (dp.total_orders||0) + '次 · ⭐' + (dp.avg_rating||0).toFixed(1) + '</span></div>' : '') +
        '<div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap;">' +
        (!u.is_active ? '<button class="btn btn-sm btn-primary" onclick="adminUnblockUser(' + u.id + ')">解禁</button>' : '') +
        (bl ? '<button class="btn btn-sm btn-primary" onclick="clearWarnings(' + dp.id + ')">解除限制</button>' : '') +
        (dp && wc > 0 && !bl ? '<button class="btn btn-sm btn-primary" onclick="clearWarnings(' + dp.id + ')">清除警告</button>' : '') +
        (u.role !== 'super_admin' && u.role !== 'admin' ? '<button class="btn btn-sm btn-outline" onclick="adminBlockUser(' + u.id + ')">禁用</button>' : '') +
        (state.role === 'super_admin' && u.role !== 'admin' && u.role !== 'super_admin' ? '<button class="btn btn-sm btn-outline" onclick="setAsAdmin(' + u.id + ')">设为管理员</button>' : '') +
        '</div></div>';
    }).join('');
  } catch(e) { c.innerHTML = '<div class="card"><p>' + e.message + '</p></div>'; }
}
async function adminBlockUser(userId) {
  if (!confirm('确定要禁用此用户吗？')) return;
  try { await api('/admin/users/' + userId + '/block', { method: 'POST' }); showToast('已禁用'); loadAdminUsers(); }
  catch(e) { showToast(e.message); }
}
async function adminUnblockUser(userId) {
  try { await api('/admin/users/' + userId + '/unblock', { method: 'POST' }); showToast('已解禁'); loadAdminUsers(); }
  catch(e) { showToast(e.message); }
}
async function clearWarnings(dpId) {
  if (!confirm('确定要清除此用户的警告和限制吗？')) return;
  try { await api('/admin/warnings/' + dpId + '/clear', { method: 'POST' }); showToast('已清除'); loadAdminUsers(); }
  catch(e) { showToast(e.message); }
}
async function setAsAdmin(userId) {
  if (!confirm('确定要将其设为管理员吗？')) return;
  try { await api('/admin/set-admin', { method: 'POST', body: JSON.stringify({ user_id: userId }) }); showToast('已设为管理员'); loadAdminUsers(); }
  catch(e) { showToast(e.message); }
}
async function resolveDispute(orderId) {
  const reason = prompt('请输入处理意见：', '已处理，订单完成');
  if (reason === null) return;
  try {
    const disputes = await api('/disputes');
    const dispute = disputes.find(d => d.order_id === orderId);
    if (dispute) {
      await api('/disputes/' + dispute.id + '/resolve', { method: 'POST', body: JSON.stringify({ status: 'resolved', response: reason }) });
      showToast('申诉已处理'); showOrderDetail(orderId);
    }
  } catch(e) { showToast(e.message); }
}
async function adminCancelOrder(orderId) {
  if (!confirm('确定要取消此订单吗？')) return;
  try { await api('/orders/' + orderId + '/cancel', { method: 'POST' }); showToast('已取消'); closeDetail(); }
  catch(e) { showToast(e.message); }
}


// ==== Base Functions ====
function showPage(pageId) {
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  document.getElementById(pageId).style.display = 'block';
}
function toggleAuthMode() {
  const mode = document.getElementById('auth-mode');
  mode.value = mode.value === 'login' ? 'register' : 'login';
  const btn = document.getElementById('auth-submit-btn');
  btn.textContent = mode.value === 'login' ? '登录' : '注册';
  document.getElementById('auth-toggle').textContent = mode.value === 'login' ? '没有账号？去注册' : '已有账号？去登录';
}
function showAuth(role) {
  document.getElementById('auth-target-role').value = role;
  const titles = { publisher: '取件人登录', delivery: '接单人登录', admin: '管理员登录' };
  document.getElementById('auth-title').textContent = titles[role] || '登录';
  showPage('page-auth');
}
async function handleAuth() {
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value.trim();
  if (!username || !password) { showToast('请填写用户名和密码'); return; }
  if (password.length < 6) { showToast('密码至少需要6位'); return; }
  const role = document.getElementById('auth-target-role').value;
  const isLogin = document.getElementById('auth-mode').value === 'login';
  try {
    let data;
    if (isLogin) {
      data = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username, password, login_role: role }) });
    } else {
      data = await api('/auth/register', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    }
    showToast((isLogin ? '登录' : '注册') + '成功');
    state.token = data.token;
    state.user = data.user;
    state.role = data.user.role;
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    if (state.role === 'publisher') showPage('page-publisher');
    else if (state.role === 'delivery') { showPage('page-delivery'); checkDeliveryStatus(); }
    else if (['admin','super_admin'].includes(state.role)) { showPage('page-admin'); loadAdminDashboard(); }
  } catch(e) { showToast(e.message); }
}
function logout() {
  state = { user: null, token: null, role: null, currentDetail: null };
  localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY);
  showPage('page-entry');
}
function showEntry() { showPage('page-entry'); }
function navigateTo(pageId) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(pageId).classList.add('active');
}
function closeDetail() {
  if (state.role === 'publisher') showPage('page-publisher');
  else if (state.role === 'delivery') showPage('page-delivery');
  else showPage('page-admin');



}
console.log('SCRIPT_END');

// ==== Form Data Upload ====
async function apiForm(path, fd) {
  const headers = {};
  if (state.token) headers['Authorization'] = 'Bearer ' + state.token;
  const res = await fetch(API_URL + path, { method: 'POST', headers, body: fd });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}
