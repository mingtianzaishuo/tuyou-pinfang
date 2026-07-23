/* 途友拼房 · 旅游订单拼房小系统
 * 前端（vanilla JS）+ 后端 API（Node/Express + SQLite），支持团队多人共享与 SSE 实时同步。
 * 存储层已改为 fetch 调用（异步），业务规则（匹配算法、日期联动）保持不变。
 */

const STORE_KEY = 'tuyou_orders_v1';
const TRIP_KEY = 'tuyou_trips_v1';
const ROOM_KEY = 'tuyou_rooms_v1';
const PAIR_KEY = 'tuyou_pairs_v1';

/* ---------- 工具 ---------- */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const DAY = 86400000;

function uid() {
  return 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function fmtDate(s) {
  const d = new Date(s);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function nights(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / DAY));
}

/* 从行程名识别天数，如：亚朵5日游 / 成都3天 / 云南7晚 → 5/3/7 */
function parseTripDays(name) {
  const m = String(name).match(/(\d+)\s*(?:天|日|晚)(?:游)?/);
  return m ? Number(m[1]) : 0;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { t.hidden = true; }, 2200);
}

/* API 错误统一提示；401 视为登录失效，退回登录页 */
function apiToast(e) {
  console.error('[api]', e);
  if (e && e.status === 401) {
    localStorage.removeItem('tuyou_token');
    // 管理员态（或正处于管理员会话）下失效：绝不弹「输入昵称」登录框，
    // 改回管理员密码登录，避免后台里突然被要求输昵称。
    if (isAdmin() || adminSessionActive) {
      requireAdminReauth();
      return;
    }
    showLogin();
    return;
  }
  toast('无法连接服务器，请检查网络或稍后重试');
}

/* 管理员登录失效：清理管理员态并改弹密码框（而非昵称框） */
function requireAdminReauth() {
  localStorage.removeItem('tuyou_admin_token');
  adminSessionActive = false;
  $$('.tab.admin-only').forEach((t) => { t.hidden = true; });
  if (!_adminReauthShown) {
    _adminReauthShown = true;
    toast('管理员登录已失效，请重新输入密码');
    showAdminLogin();
  }
}

/* ---------- 存储层（后端 API，异步） ---------- */
async function loadOrders() {
  try { return (await api.get('/orders')) || []; } catch (e) { apiToast(e); return []; }
}
async function getOrder(id) {
  try { return (await api.get('/orders/' + encodeURIComponent(id))) || null; } catch (e) { apiToast(e); return null; }
}
async function createOrder(data) {
  try { await api.post('/orders', data); return true; } catch (e) { apiToast(e); return false; }
}
async function updateOrder(id, data) {
  try { await api.put('/orders/' + encodeURIComponent(id), data); return true; } catch (e) { apiToast(e); return false; }
}
async function removeOrder(id) {
  try { await api.del('/orders/' + encodeURIComponent(id)); return true; } catch (e) { apiToast(e); return false; }
}

async function loadTrips() {
  try { return ((await api.get('/trips')) || []).map((t) => t.name); } catch (e) { apiToast(e); return []; }
}
async function addTripApi(name) {
  try { await api.post('/trips', { name }); return true; } catch (e) { apiToast(e); return false; }
}
async function removeTrip(name) {
  try { await api.del('/trips/' + encodeURIComponent(name)); return true; } catch (e) { apiToast(e); return false; }
}

async function loadRooms() {
  try { return ((await api.get('/rooms')) || []).map((r) => r.name); } catch (e) { apiToast(e); return []; }
}
async function addRoomApi(name) {
  try { await api.post('/rooms', { name }); return true; } catch (e) { apiToast(e); return false; }
}
async function removeRoom(name) {
  try { await api.del('/rooms/' + encodeURIComponent(name)); return true; } catch (e) { apiToast(e); return false; }
}

async function loadPairs() {
  try { return (await api.get('/pairs')) || []; } catch (e) { apiToast(e); return []; }
}
async function createPair(a, b) {
  try { await api.post('/pairs', { a, b }); return true; } catch (e) { apiToast(e); return false; }
}
async function removePair(id) {
  try { await api.del('/pairs/' + encodeURIComponent(id)); return true; } catch (e) { apiToast(e); return false; }
}

/* ---------- 管理员专属 API（携带 tuyou_admin_token） ---------- */
function isAdmin() { return !!localStorage.getItem('tuyou_admin_token'); }

let _adminErrShown = false;
function adminApiToast(e) {
  console.error('[admin-api]', e);
  if (e && e.status === 401) {
    // 管理员接口失效：弹密码框重新进入，而非昵称框
    requireAdminReauth();
    return;
  }
  if (!_adminErrShown) {
    _adminErrShown = true;
    toast('操作失败，请重试');
  }
}

/* 携带管理员 token 的请求封装 */
async function adminReq(path, opt = {}) {
  return api.req(path, Object.assign({}, opt, { token: localStorage.getItem('tuyou_admin_token') }));
}

async function loadUsers() {
  try { return (await adminReq('/users')) || []; } catch (e) { adminApiToast(e); return []; }
}
async function addUserApi(name, role) {
  try { await adminReq('/admin/users', { method: 'POST', body: JSON.stringify({ name, role }) }); return true; } catch (e) { adminApiToast(e); return false; }
}
async function saveUserApi(id, name, role) {
  try { await adminReq('/admin/users/' + encodeURIComponent(id), { method: 'PUT', body: JSON.stringify({ name, role }) }); return true; } catch (e) { adminApiToast(e); return false; }
}
async function deleteUserApi(id) {
  try { await adminReq('/admin/users/' + encodeURIComponent(id), { method: 'DELETE' }); return true; } catch (e) { adminApiToast(e); return false; }
}
async function adminKickUserApi(id) {
  try { await adminReq('/admin/users/' + encodeURIComponent(id) + '/sessions', { method: 'DELETE' }); return true; } catch (e) { adminApiToast(e); return false; }
}
async function loadAdminOrders() {
  try { return (await adminReq('/admin/orders')) || []; } catch (e) { adminApiToast(e); return []; }
}
async function deleteAdminOrder(id) {
  try { await adminReq('/admin/orders/' + encodeURIComponent(id), { method: 'DELETE' }); return true; } catch (e) { adminApiToast(e); return false; }
}
async function loadAdminPairs() {
  try { return (await adminReq('/pairs')) || []; } catch (e) { adminApiToast(e); return []; }
}
async function loadAdminLogs() {
  try { return (await adminReq('/admin/logs')) || []; } catch (e) { adminApiToast(e); return []; }
}
async function changeAdminPassword(current, next) {
  try { await adminReq('/admin/password', { method: 'POST', body: JSON.stringify({ current, next }) }); return true; } catch (e) { adminApiToast(e); return false; }
}
async function logAdminAction(action, detail) {
  try { await adminReq('/admin/log', { method: 'POST', body: JSON.stringify({ action, detail }) }); } catch (_) { /* 忽略 */ }
}

/* ---------- 导出工具 ---------- */
function dateStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate());
}
function downloadFile(filename, content, mime) {
  // 加 BOM 保证 Excel 正确识别 UTF-8 中文
  const blob = new Blob(['﻿' + content], { type: mime + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
function toCSV(rows, headers) {
  const esc = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const head = headers.map((h) => esc(h.label)).join(',');
  const body = rows.map((r) => headers.map((h) => esc(r[h.key])).join(',')).join('\n');
  return head + '\n' + body;
}
function fmtDateTime(s) {
  const d = new Date(s);
  if (isNaN(d)) return s || '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* ---------- 首次种子（本地兜底，不再写 localStorage 业务数据） ---------- */
function seedOrders() {
  const today = new Date();
  const d = (offset, len) => {
    const s = new Date(today); s.setDate(s.getDate() + offset);
    const e = new Date(s); e.setDate(s.getDate() + len);
    return [s.toISOString().slice(0, 10), e.toISOString().slice(0, 10)];
  };
  return [
    { id: uid(), userName: '小鹿', gender: '女', age: 25, trip: '成都', roomType: '双床房', checkIn: d(3, 3)[0], checkOut: d(3, 3)[1], preferredGender: '仅女生', contact: '销售-李娜', salesNote: '销售小U：客人想拼房，已确认同性别', note: '早睡党，不抽烟，爱吃火锅', createdAt: Date.now() - 5000 },
    { id: uid(), userName: '阿哲', gender: '男', age: 28, trip: '成都', roomType: '双床房', checkIn: d(4, 2)[0], checkOut: d(4, 2)[1], preferredGender: '同性别', contact: '销售-王强', salesNote: '销售小U：客人可接受拼同性室友', note: '摄影爱好者，白天出去玩晚上才回', createdAt: Date.now() - 4000 },
    { id: uid(), userName: 'Mia', gender: '女', age: 32, trip: '重庆', roomType: '大床房', checkIn: d(6, 4)[0], checkOut: d(6, 4)[1], preferredGender: '仅女生', contact: '销售-张敏', salesNote: '', note: '商务出差顺带玩，作息规律', createdAt: Date.now() - 3000 },
    { id: uid(), userName: '老王', gender: '男', age: 45, trip: '重庆', roomType: '双床房', checkIn: d(7, 3)[0], checkOut: d(7, 3)[1], preferredGender: '不限', contact: '销售-赵磊', salesNote: '', note: '资深驴友，好相处', createdAt: Date.now() - 2000 },
    { id: uid(), userName: 'Coco', gender: '女', age: 27, trip: '三亚', roomType: '双床房', checkIn: d(10, 5)[0], checkOut: d(10, 5)[1], preferredGender: '仅女生', contact: '销售-陈静', salesNote: '销售小U：客人想拼，预算不限', note: '海岛度假，想找一起看日出的', createdAt: Date.now() - 1000 },
  ];
}
function seedTrips() { return ['成都', '重庆', '三亚', '云南', '西安', '厦门']; }
function seedRooms() { return ['双床房', '大床房', '标间']; }

/* ---------- 性别兼容性 ---------- */
function genderOk(a, b) {
  const accept = (pref, me, other) => {
    if (pref === '不限') return true;
    if (pref === '同性别') return me === other;
    if (pref === '仅女生') return other === '女';
    return false;
  };
  return accept(a.preferredGender, a.gender, b.gender) &&
         accept(b.preferredGender, b.gender, a.gender);
}

/* ---------- 匹配算法 ---------- */
async function findMatches(source, all) {
  const list = all || (await loadOrders());
  const results = [];
  for (const o of list) {
    if (o.id === source.id) continue;
    if (o.trip !== source.trip) continue;
    const start = new Date(Math.max(new Date(source.checkIn), new Date(o.checkIn)));
    const end = new Date(Math.min(new Date(source.checkOut), new Date(o.checkOut)));
    const overlap = Math.round((end - start) / DAY);
    if (overlap <= 0) continue;
    if (!genderOk(source, o)) continue;
    if (source.roomType !== o.roomType && source.roomType !== '双床房' && o.roomType !== '双床房') continue;
    results.push({ other: o, overlap });
  }
  results.sort((x, y) => y.overlap - x.overlap);
  return results;
}

/* ---------- 行程目录渲染与增删 ---------- */
async function refreshTripList() {
  const sel = $('#trip-select');
  const trips = await loadTrips();
  sel.innerHTML = trips.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
}

async function addTrip() {
  const input = $('#trip-new');
  const name = input.value.trim();
  if (!name) { toast('请输入行程名称'); return; }
  const trips = await loadTrips();
  if (trips.includes(name)) { toast('该行程已存在'); return; }
  if (!(await addTripApi(name))) return;
  await refreshTripList();
  $('#trip-select').value = name;
  input.value = '';
  toggleTripPop(false);
  toast('已添加行程：' + name);
}

function toggleTripPop(show) {
  const pop = $('#trip-add-pop');
  const link = $('#trip-add-link');
  pop.hidden = !show;
  if (link) link.classList.toggle('active', show);
  if (show) setTimeout(() => $('#trip-new').focus(), 30);
  else $('#trip-new').value = '';
}

async function deleteTrip(name) {
  if (!(await removeTrip(name))) return;
  await refreshTripList();
  toast('已删除行程：' + name);
}

/* ---------- 房型目录渲染与增删 ---------- */
async function refreshRoomList() {
  const sel = $('#room-select');
  const rooms = await loadRooms();
  sel.innerHTML = rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
}

async function addRoom() {
  const input = $('#room-new');
  const name = input.value.trim();
  if (!name) { toast('请输入房型名称'); return; }
  const rooms = await loadRooms();
  if (rooms.includes(name)) { toast('该房型已存在'); return; }
  if (!(await addRoomApi(name))) return;
  await refreshRoomList();
  $('#room-select').value = name;
  input.value = '';
  toggleRoomPop(false);
  toast('已添加房型：' + name);
}

function toggleRoomPop(show) {
  const pop = $('#room-add-pop');
  const link = $('#room-add-link');
  pop.hidden = !show;
  if (link) link.classList.toggle('active', show);
  if (show) setTimeout(() => $('#room-new').focus(), 30);
  else $('#room-new').value = '';
}

async function deleteRoom(name) {
  if (!(await removeRoom(name))) return;
  await refreshRoomList();
  toast('已删除房型：' + name);
}

/* ---------- 大厅手动拼房：选择状态 ---------- */
let pairSelectId = null; // 第一步选中的甲方订单 id
let editId = null;       // 正在编辑的订单 id（null 表示新增，发布表单用）
let editModalId = null;  // 大厅弹窗编辑中的订单 id
let editModalKeyHandler = null;
let currentUser = null;  // 当前登录用户 {id,name,role}
let sse = null;          // EventSource 实例
let sseTimer = null;     // SSE 防抖计时
let adminSessionActive = false; // 是否处于管理员会话态（用于 401 路由：弹密码框而非昵称框）
let _adminReauthShown = false;  // 防止管理员失效时重复弹密码框

async function selectForPair(id) {
  if (pairSelectId === null) {
    pairSelectId = id;
    const o = await getOrder(id);
    toast(`已选「${o ? o.userName : ''}」为甲方，请再选一位拼友`);
    await renderHall();
    return;
  }
  if (pairSelectId === id) {
    pairSelectId = null;
    await renderHall();
    toast('已取消选择');
    return;
  }
  await confirmPair(pairSelectId, id);
  pairSelectId = null;
  await renderHall();
}

async function renderPairBanner() {
  const banner = $('#hall-pair-banner');
  if (pairSelectId === null) {
    banner.hidden = true;
    return;
  }
  const o = await getOrder(pairSelectId);
  banner.hidden = false;
  banner.innerHTML = `
    <span>已选 <b>${escapeHtml(o ? o.userName : '')}</b> 为甲方，再点另一位团员上的「选为拼友」即可拼成（不限匹配条件）；点同一张卡可取消。</span>
    <button type="button" class="btn small ghost" id="pair-cancel">取消</button>
  `;
  const cancel = $('#pair-cancel');
  if (cancel) cancel.addEventListener('click', () => { pairSelectId = null; renderHall(); });
}

/* ---------- 右键菜单 ---------- */
let ctxTarget = null;
let roomCtxTarget = null;

function showContextMenu(x, y, name) {
  ctxTarget = name;
  $('#ctx-label').textContent = '删除行程：' + name;
  const menu = $('#context-menu');
  menu.hidden = false;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function hideContextMenu() {
  $('#context-menu').hidden = true;
  ctxTarget = null;
}

function showRoomContextMenu(x, y, name) {
  roomCtxTarget = name;
  $('#room-ctx-label').textContent = '删除房型：' + name;
  const menu = $('#room-context-menu');
  menu.hidden = false;
  menu.style.left = x + 'px';
  menu.style.top = y + 'px';
}

function hideRoomContextMenu() {
  $('#room-context-menu').hidden = true;
  roomCtxTarget = null;
}

/* ---------- 拼成记录：确认 / 删除 ---------- */
async function pairExists(aId, bId) {
  const pairs = await loadPairs();
  return pairs.some((p) => (p.a === aId && p.b === bId) || (p.a === bId && p.b === aId));
}

async function confirmPair(aId, bId) {
  if (await pairExists(aId, bId)) { toast('这两位已经拼成啦'); return; }
  if (!(await createPair(aId, bId))) return;
  toast('拼房成功！已记录到「拼成记录」');
  await switchView('paired');
}

function deletePair(pairId) {
  showConfirm('确认解除这条拼房记录？', async () => {
    if (!(await removePair(pairId))) return;
    await renderPairs();
    await renderStats();
    toast('已解除拼房记录');
  });
}

async function deleteOrder(id) {
  const o = await getOrder(id);
  showConfirm(`确认删除「${o ? o.userName : '该'}」的拼房需求？相关拼成记录也会一并删除。`, async () => {
    if (!(await removeOrder(id))) return;
    await renderHall();
    await renderMatchSource();
    await renderStats();
    toast('已删除拼房需求');
  });
}

/* ---------- 自定义确认弹窗（替代原生 confirm） ---------- */
function showConfirm(message, onConfirm) {
  const overlay = $('#confirm-modal');
  const msgEl = $('#confirm-message');
  const okBtn = $('#confirm-ok');
  const cancelBtn = $('#confirm-cancel');
  if (!overlay || !msgEl || !okBtn || !cancelBtn) return; // 防御：元素缺失时降级
  msgEl.textContent = message;
  let keyHandler;
  const close = () => {
    overlay.hidden = true;
    if (keyHandler) document.removeEventListener('keydown', keyHandler);
  };
  const doConfirm = () => { close(); onConfirm(); };
  keyHandler = (e) => { if (e.key === 'Escape') close(); };
  okBtn.onclick = doConfirm;
  cancelBtn.onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
  document.addEventListener('keydown', keyHandler);
  overlay.hidden = false;
}

/* ---------- 编辑订单：弹窗回填 ---------- */
async function editOrder(id) {
  const o = await getOrder(id);
  if (!o) return;
  editModalId = id;
  const f = $('#edit-form');
  // 行程下拉：含当前值（即使不在目录中也能选中）
  const trips = await loadTrips();
  if (!trips.includes(o.trip)) trips.unshift(o.trip);
  $('#edit-trip-select').innerHTML = trips.map((t) => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('');
  const rooms = await loadRooms();
  if (!rooms.includes(o.roomType)) rooms.unshift(o.roomType);
  $('#edit-room-select').innerHTML = rooms.map((r) => `<option value="${escapeHtml(r)}">${escapeHtml(r)}</option>`).join('');
  // 回填字段
  f.editUserName.value = o.userName;
  f.editGender.value = o.gender;
  f.editAge.value = o.age;
  f.editTrip.value = o.trip;
  const days = parseTripDays(o.trip) || (nights(o.checkIn, o.checkOut) + 1);
  f.editTripDays.value = days;
  f.editRoomType.value = o.roomType;
  f.editCheckIn.value = o.checkIn;
  f.editCheckOut.value = o.checkOut;
  f.editPreferredGender.value = o.preferredGender;
  f.editContact.value = o.contact;
  f.editSalesNote.value = o.salesNote || '';
  f.editNote.value = o.note || '';
  // 显示弹窗并绑定 ESC
  $('#edit-modal').hidden = false;
  if (editModalKeyHandler) document.removeEventListener('keydown', editModalKeyHandler);
  editModalKeyHandler = (e) => { if (e.key === 'Escape') closeEditModal(); };
  document.addEventListener('keydown', editModalKeyHandler);
  toast(`正在编辑「${o.userName}」的需求`);
}

function closeEditModal() {
  $('#edit-modal').hidden = true;
  editModalId = null;
  if (editModalKeyHandler) {
    document.removeEventListener('keydown', editModalKeyHandler);
    editModalKeyHandler = null;
  }
}

async function handleEditSubmit(e) {
  e.preventDefault();
  if (!editModalId) return;
  const f = e.target;
  const original = await getOrder(editModalId);
  const data = {
    id: editModalId,
    userName: f.editUserName.value.trim(),
    gender: f.editGender.value,
    age: Number(f.editAge.value),
    trip: f.editTrip.value,
    roomType: f.editRoomType.value,
    checkIn: f.editCheckIn.value,
    checkOut: f.editCheckOut.value,
    preferredGender: f.editPreferredGender.value,
    contact: f.editContact.value.trim(),
    salesNote: f.editSalesNote.value.trim(),
    note: f.editNote.value.trim(),
    createdAt: original ? original.createdAt : Date.now(),
  };
  if (!(await updateOrder(editModalId, data))) return;
  closeEditModal();
  await renderHall();
  await renderMatchSource();
  await renderStats();
  toast(`「${data.userName}」的需求已更新`);
}

/* ---------- 渲染：大厅 ---------- */
async function renderHall() {
  const trip = $('#filter-trip').value.trim();
  const g = $('#filter-gender').value;
  const r = $('#filter-room').value;
  let list = await loadOrders();
  if (trip) list = list.filter((o) => o.trip.includes(trip));
  if (g) list = list.filter((o) => o.preferredGender === g);
  if (r) list = list.filter((o) => o.roomType === r);
  list.sort((a, b) => b.createdAt - a.createdAt);

  const box = $('#hall-list');
  box.innerHTML = '';
  $('#hall-empty').hidden = list.length > 0;

  for (const o of list) {
    const card = document.createElement('div');
    card.className = 'order-card' + (pairSelectId === o.id ? ' selected' : '');
    const gCls = o.gender === '女' ? 'gender-f' : 'gender-m';
    let pairBtn;
    if (pairSelectId === null) {
      pairBtn = `<button type="button" class="pair-btn" data-pair-pick="${o.id}">拼</button>`;
    } else if (pairSelectId === o.id) {
      pairBtn = `<button type="button" class="pair-btn on" data-pair-pick="${o.id}">✓ 甲方</button>`;
    } else {
      const done = await pairExists(pairSelectId, o.id);
      pairBtn = `<button type="button" class="pair-btn pick" data-pair-pick="${o.id}" ${done ? 'disabled style="opacity:.5;cursor:default;"' : ''}>${done ? '已拼成' : '选为拼友'}</button>`;
    }
    card.innerHTML = `
      <div class="top">
        <span class="who">${escapeHtml(o.userName)} · ${o.age}岁</span>
        <span class="badge ${gCls}">${o.gender}</span>
      </div>
      <div class="dest-name">📍 ${escapeHtml(o.trip)}</div>
      <div class="meta">
        <span>🗓 <b>${fmtDate(o.checkIn)}</b> → <b>${fmtDate(o.checkOut)}</b>（${nights(o.checkIn, o.checkOut)} 晚）</span>
        <span>🛏 房型：<b>${o.roomType}</b> · 偏好：<b>${o.preferredGender}</b></span>
      </div>
      ${o.salesNote ? `<div class="sales-note"><b>销售备注：</b>${escapeHtml(o.salesNote)}</div>` : ''}
      ${o.note ? `<div class="note">${escapeHtml(o.note)}</div>` : ''}
      <div class="foot">
        <span class="tag">👤 销售：${escapeHtml(o.contact)}</span>
        <span class="foot-btns">
          <button type="button" class="edit" data-edit="${o.id}">编辑</button>
          ${pairBtn}
          <button type="button" class="del" data-del="${o.id}">删除</button>
        </span>
      </div>
    `;
    box.appendChild(card);
  }
  box.querySelectorAll('[data-del]').forEach((btn) => {
    btn.addEventListener('click', () => deleteOrder(btn.dataset.del));
  });
  box.querySelectorAll('[data-edit]').forEach((btn) => {
    btn.addEventListener('click', () => editOrder(btn.dataset.edit));
  });
  box.querySelectorAll('[data-pair-pick]').forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => selectForPair(btn.dataset.pairPick));
  });
  await renderPairBanner();
}

/* ---------- 渲染：匹配 ---------- */
async function renderMatchSource() {
  const sel = $('#match-source');
  const orders = (await loadOrders()).sort((a, b) => b.createdAt - a.createdAt);
  sel.innerHTML = orders.map((o) => `<option value="${o.id}">${escapeHtml(o.userName)}（${o.age}岁） · ${escapeHtml(o.trip)} · ${fmtDate(o.checkIn)}</option>`).join('');
}

async function runMatch() {
  const id = $('#match-source').value;
  if (!id) { toast('请先选择一条需求'); return; }
  const orders = await loadOrders();
  const source = orders.find((o) => o.id === id);
  if (!source) { toast('需求不存在'); return; }
  const matches = await findMatches(source, orders);
  const box = $('#match-result');
  box.innerHTML = '';

  const head = document.createElement('div');
  head.className = 'card';
  head.innerHTML = `<h3>以「${escapeHtml(source.userName)}」的${escapeHtml(source.trip)}行程为基准</h3>
    <p class="muted">出团 ${fmtDate(source.checkIn)} → 完团 ${fmtDate(source.checkOut)}，偏好「${source.preferredGender}」</p>`;
  box.appendChild(head);

  if (matches.length === 0) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = '暂时没有匹配到的拼友，换个时间或放宽偏好试试～';
    box.appendChild(p);
    return;
  }

  for (const m of matches) {
    const o = m.other;
    const el = document.createElement('div');
    el.className = 'match-pair';
    const paired = await pairExists(source.id, o.id);
    el.innerHTML = `
      <div class="head">
        <strong>匹配度：重叠 ${m.overlap} 晚 · 房型 ${o.roomType}</strong>
        <span class="vs">${escapeHtml(source.userName)} ⇄ ${escapeHtml(o.userName)}</span>
      </div>
      <div class="rows">
        <div class="side">
          <div class="name">${escapeHtml(source.userName)}（${source.gender} · ${source.age}岁）</div>
          <div>${fmtDate(source.checkIn)} → ${fmtDate(source.checkOut)}</div>
          <div>销售：${escapeHtml(source.contact)}</div>
        </div>
        <div class="side">
          <div class="name">${escapeHtml(o.userName)}（${o.gender} · ${o.age}岁）</div>
          <div>${fmtDate(o.checkIn)} → ${fmtDate(o.checkOut)}</div>
          <div>销售：${escapeHtml(o.contact)}</div>
        </div>
      </div>
      ${o.salesNote ? `<div class="note"><b>对方销售备注：</b>${escapeHtml(o.salesNote)}</div>` : ''}
      ${o.note ? `<div class="note">对方备注：${escapeHtml(o.note)}</div>` : ''}
      <div class="saving" style="background:var(--primary-soft);color:#157a6e;border-radius:10px;padding:10px 14px;font-size:14px;font-weight:600;margin-top:12px;display:flex;justify-content:space-between;align-items:center;">
        <span>建议为该团员安排同一房间 / 同一团期</span>
        <button type="button" class="btn small" data-pair="${source.id}|${o.id}" ${paired ? 'disabled style="opacity:.5;cursor:default;"' : ''}>${paired ? '已拼成' : '确认拼房'}</button>
      </div>
    `;
    box.appendChild(el);
  }
  box.querySelectorAll('[data-pair]').forEach((btn) => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const [a, b] = btn.dataset.pair.split('|');
      confirmPair(a, b);
    });
  });
}

/* ---------- 渲染：拼成记录 ---------- */
async function renderPairs() {
  const pairs = (await loadPairs()).sort((a, b) => b.createdAt - a.createdAt);
  const orders = await loadOrders();
  const orderMap = {};
  orders.forEach((o) => { orderMap[o.id] = o; });
  const box = $('#paired-list');
  box.innerHTML = '';
  $('#paired-empty').hidden = pairs.length > 0;

  for (const p of pairs) {
    const a = orderMap[p.a];
    const b = orderMap[p.b];
    const sideHtml = (o, missing) => {
      if (!o) return `<div class="paired-side"><div class="paired-name">[需求已删除]</div></div>`;
      const gCls = o.gender === '女' ? 'gender-f' : 'gender-m';
      return `
        <div class="paired-side">
          <div class="paired-name">${escapeHtml(o.userName)} · ${o.age}岁 <span class="badge ${gCls}">${o.gender}</span></div>
          <div class="paired-meta">
            <span>📍 ${escapeHtml(o.trip)}</span>
            <span>🗓 ${fmtDate(o.checkIn)} → ${fmtDate(o.checkOut)}（${nights(o.checkIn, o.checkOut)} 晚）</span>
            <span>🛏 ${o.roomType} · 偏好 ${o.preferredGender}</span>
            <span>👤 销售：${escapeHtml(o.contact)}</span>
          </div>
          ${o.salesNote ? `<div class="sales-note" style="margin-top:10px;"><b>销售备注：</b>${escapeHtml(o.salesNote)}</div>` : ''}
        </div>`;
    };
    const wrap = document.createElement('div');
    wrap.className = 'paired-pair';
    wrap.innerHTML = `
      ${sideHtml(a)}
      <div class="paired-link"><span class="lbl">拼房</span></div>
      ${sideHtml(b)}
      <div class="paired-foot">
        <button type="button" class="del" data-unpair="${p.id}">解除拼房</button>
      </div>
    `;
    box.appendChild(wrap);
  }
  // 事件委托，避免绝对定位按钮被遮挡
  box.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-unpair]');
    if (!btn) return;
    deletePair(btn.dataset.unpair);
  });
}

/* ---------- 渲染：统计 ---------- */
/* 通用横向条形分布渲染（复用 .rank-list / .rank-item 风格） */
function renderDist(boxId, items) {
  const box = $('#' + boxId);
  if (!items.length) {
    box.innerHTML = '<div class="muted" style="padding:6px 0;">暂无数据</div>';
    return;
  }
  const max = Math.max(1, ...items.map((i) => i.count));
  box.innerHTML = items.map((i) => `
    <div class="rank-item">
      <span style="min-width:56px;">${escapeHtml(i.label)}</span>
      <div class="rank-bar"><span style="width:${(i.count / max) * 100}%;${i.color ? `background:${i.color};` : ''}"></span></div>
      <span class="rank-count">${i.count}</span>
    </div>`).join('');
}

async function renderStats() {
  const orders = await loadOrders();
  $('#stat-orders').textContent = orders.length;

  const tripsSet = new Set(orders.map((o) => o.trip));
  $('#stat-dests').textContent = tripsSet.size;

  const pairs = await loadPairs();
  let totalNights = 0;
  for (const o of orders) {
    const ms = await findMatches(o, orders);
    totalNights += ms.reduce((s, m) => s + m.overlap, 0);
  }
  $('#stat-matches').textContent = pairs.length;
  $('#stat-nights').textContent = totalNights;

  const rate = orders.length ? Math.round((pairs.length / orders.length) * 100) : 0;
  $('#stat-rate').textContent = rate + '%';

  const rank = {};
  orders.forEach((o) => { rank[o.trip] = (rank[o.trip] || 0) + 1; });
  const max = Math.max(1, ...Object.values(rank));
  $('#dest-rank').innerHTML = Object.entries(rank).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `<div class="rank-item"><span style="min-width:48px;">${escapeHtml(k)}</span><div class="rank-bar"><span style="width:${(v / max) * 100}%"></span></div><span class="rank-count">${v}</span></div>`)
    .join('');

  const gF = orders.filter((o) => o.gender === '女').length;
  const gM = orders.filter((o) => o.gender === '男').length;
  renderDist('gender-dist', [
    { label: '女', count: gF, color: '#c2417a' },
    { label: '男', count: gM, color: '#2b5fc4' },
  ]);

  const roomCount = {};
  orders.forEach((o) => { roomCount[o.roomType] = (roomCount[o.roomType] || 0) + 1; });
  const roomItems = Object.entries(roomCount).sort((a, b) => b[1] - a[1])
    .map(([k, v]) => ({ label: k, count: v }));
  renderDist('room-dist', roomItems);

  const recent = orders.slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 5);
  $('#recent-list').innerHTML = recent.map((o) =>
    `<div class="recent-item"><span class="r-dest">${escapeHtml(o.trip)}</span><span>${escapeHtml(o.userName)} · ${fmtDate(o.checkIn)} · ${nights(o.checkIn, o.checkOut)} 晚</span></div>`
  ).join('');
}

/* ---------- 渲染：管理后台（数据概览 + 成员 + 订单） ---------- */
async function renderAdmin() {
  _adminErrShown = false;
  let users = [], orders = [], pairs = [];
  try {
    [users, orders, pairs] = await Promise.all([loadUsers(), loadAdminOrders(), loadAdminPairs()]);
  } catch (e) { adminApiToast(e); }
  renderAdminStats(users, orders, pairs);
  renderAdminUsers(users);
  renderAdminOrders(orders);
  renderAdminLogs();
}

function renderAdminStats(users, orders, pairs) {
  const box = $('#admin-stats');
  if (!box) return;
  const totalNights = orders.reduce((s, o) => s + nights(o.checkIn, o.checkOut), 0);
  const rate = orders.length ? Math.round((pairs.length / orders.length) * 100) : 0;
  const cards = [
    { n: users.length, l: '团队成员' },
    { n: orders.length, l: '拼房需求' },
    { n: pairs.length, l: '已拼成' },
    { n: totalNights, l: '拼房总晚数' },
    { n: rate + '%', l: '拼成率' },
  ];
  box.innerHTML = cards.map((c) =>
    `<div class="stat-card"><div class="stat-num">${c.n}</div><div class="stat-label">${c.l}</div></div>`
  ).join('');
}

function renderAdminUsers(users) {
  const box = $('#admin-users');
  if (!users.length) { box.innerHTML = '<p class="muted">暂无成员，使用上方表单添加。</p>'; return; }
  box.innerHTML = users.map((u) => `
    <div class="admin-user-item" data-user-id="${escapeHtml(u.id)}">
      <input type="text" class="user-name-input" data-user-id="${escapeHtml(u.id)}" value="${escapeHtml(u.name)}" maxlength="40" />
      <select class="role-select" data-user-id="${escapeHtml(u.id)}">
        <option value="sales" ${u.role === 'sales' ? 'selected' : ''}>销售</option>
        <option value="guide" ${u.role === 'guide' ? 'selected' : ''}>导游</option>
        <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>管理员</option>
      </select>
      <button type="button" class="btn small primary" data-save-user="${escapeHtml(u.id)}">保存</button>
      <button type="button" class="btn small ghost" data-kick-user="${escapeHtml(u.id)}" data-kick-name="${escapeHtml(u.name)}">强制退出</button>
      <button type="button" class="btn small danger" data-del-user="${escapeHtml(u.id)}">删除</button>
    </div>`).join('');
  box.querySelectorAll('[data-save-user]').forEach((btn) => {
    btn.addEventListener('click', () => saveUser(btn.dataset.saveUser));
  });
  box.querySelectorAll('[data-kick-user]').forEach((btn) => {
    btn.addEventListener('click', () => kickUser(btn.dataset.kickUser, btn.dataset.kickName));
  });
  box.querySelectorAll('[data-del-user]').forEach((btn) => {
    btn.addEventListener('click', () => deleteUser(btn.dataset.delUser));
  });
}

function renderAdminOrders(orders) {
  const box = $('#admin-orders');
  if (!orders.length) { box.innerHTML = '<p class="muted">暂无订单</p>'; return; }
  box.innerHTML = orders.map((o) => `
    <div class="admin-order-item" data-id="${escapeHtml(o.id)}">
      <div class="ao-main">
        <span class="ao-name">${escapeHtml(o.userName)}</span>
        <span class="ao-trip">📍 ${escapeHtml(o.trip)}</span>
        <span class="ao-dates">${fmtDate(o.checkIn)}→${fmtDate(o.checkOut)}（${nights(o.checkIn, o.checkOut)} 晚）</span>
        <span class="ao-owner">归属：${escapeHtml(o.owner_name || '未知')}</span>
      </div>
      <button type="button" class="btn small danger" data-del-order="${escapeHtml(o.id)}">删除</button>
    </div>`).join('');
  box.querySelectorAll('[data-del-order]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.delOrder;
      showConfirm('确认以管理员身份删除这条需求？关联拼成记录也会一并删除。', async () => {
        if (!(await deleteAdminOrder(id))) return;
        toast('已删除需求');
        await renderAdmin();
      });
    });
  });
}

async function renderAdminLogs() {
  const logs = await loadAdminLogs();
  const box = $('#admin-logs');
  if (!box) return;
  if (!logs.length) { box.innerHTML = '<p class="muted">暂无操作记录</p>'; return; }
  box.innerHTML = logs.map((l) => `
    <div class="log-item">
      <span class="log-action">${escapeHtml(l.action)}</span>
      <span class="log-detail">${escapeHtml(l.detail)}</span>
      <span class="log-at">${fmtDateTime(l.at)}</span>
    </div>`).join('');
}

/* ---------- 团队成员：添加 / 修改 / 删除 ---------- */
async function addUser() {
  const f = $('#admin-add-user-form');
  const name = f.name.value.trim();
  const role = f.role.value;
  if (!name) { toast('请输入成员昵称'); return; }
  if (!(await addUserApi(name, role))) return;
  f.reset();
  toast('成员已添加');
  await renderAdmin();
}

async function saveUser(id) {
  const row = document.querySelector(`.admin-user-item[data-user-id="${CSS.escape(id)}"]`);
  if (!row) return;
  const name = row.querySelector('.user-name-input').value.trim();
  const role = row.querySelector('.role-select').value;
  if (!name) { toast('昵称不能为空'); return; }
  if (!(await saveUserApi(id, name, role))) return;
  toast('成员已更新');
  await renderAdmin();
}

async function deleteUser(id) {
  showConfirm('确认删除该团队成员？其发布的拼房需求与拼成记录也会一并删除。', async () => {
    if (!(await deleteUserApi(id))) return;
    toast('已删除成员');
    await renderAdmin();
  });
}

async function kickUser(id, name) {
  showConfirm(`确认强制退出「${name}」？该成员的所有登录态将被清除，下次需重新输入昵称登录。`, async () => {
    if (!(await adminKickUserApi(id))) return;
    toast(`「${name}」已被强制退出`);
    await renderAdmin();
  });
}

/* ---------- 工具：转义 ---------- */
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- 表单提交 ---------- */
async function handleSubmit(e) {
  e.preventDefault();
  const f = e.target;
  const data = {
    id: uid(),
    userName: f.userName.value.trim(),
    gender: f.gender.value,
    age: Number(f.age.value),
    trip: f.trip.value,
    roomType: f.roomType.value,
    checkIn: f.checkIn.value,
    checkOut: f.checkOut.value,
    preferredGender: f.preferredGender.value,
    contact: f.contact.value.trim(),
    salesNote: f.salesNote.value.trim(),
    note: f.note.value.trim(),
    createdAt: Date.now(),
  };
  if (new Date(data.checkOut) <= new Date(data.checkIn)) {
    toast('完团日期需晚于出团日期');
    return;
  }
  if (editId) {
    const ok = await updateOrder(editId, data);
    if (!ok) return;
    editId = null;
    f.querySelector('.btn.primary').textContent = '发布需求';
    f.reset();
    await refreshTripList();
    toast('修改已保存！可去拼房大厅查看');
    await renderHall();
    await renderMatchSource();
    await renderStats();
    await switchView('hall');
    return;
  }
  if (!(await createOrder(data))) return;
  f.reset();
  await refreshTripList();
  toast('发布成功！可去拼房大厅或智能匹配查看');
  await renderMatchSource();
}

/* ---------- Tab 切换 ---------- */
async function switchView(view) {
  if (view !== 'hall') pairSelectId = null; // 离开大厅时清理手动拼房选择态
  if (view !== 'post') {
    editId = null;
    const sb = $('#post-form .btn.primary');
    if (sb) sb.textContent = '发布需求';
    toggleTripPop(false);
    toggleRoomPop(false);
  }
  $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.view === view));
  $$('.view').forEach((v) => v.classList.toggle('active', v.id === 'view-' + view));
  if (view === 'hall') await renderHall();
  if (view === 'match') await renderMatchSource();
  if (view === 'paired') await renderPairs();
  if (view === 'stats') await renderStats();
  if (view === 'admin') await renderAdmin();
}

/* ---------- 登录 / SSE / 迁移 ---------- */
function showLogin() {
  const m = $('#login-modal');
  m.hidden = false;
  $('#user-area').hidden = true;
  const f = $('#login-form');
  if (f.dataset.bound) return;
  f.dataset.bound = '1';
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = f.name.value.trim();
    if (!name) { toast('请输入昵称'); return; }
    try {
      const r = await api.post('/login', { name });
      localStorage.setItem('tuyou_token', r.token);
      currentUser = r.user;
      m.hidden = true;
      onLoggedIn(false); // false = 手动登录
    } catch (err) {
      apiToast(err);
    }
  });
}

function onLoggedIn(isAuto) {
  $('#user-area').hidden = false;
  $('#user-name').textContent = (currentUser ? currentUser.name : '') + ' · ' + roleLabel(currentUser ? currentUser.role : '');
  updateAdminUI();
  connectSSE();
  refreshAll();
  if (isAuto && currentUser) {
    toast(`欢迎回来，${currentUser.name}～`);
  }
  // 首次进入若本地仍有旧数据，提示迁移
  if (localStorage.getItem(STORE_KEY)) {
    showConfirm('检测到浏览器中的旧拼房数据，是否导入到团队共享空间？', async () => {
      await importLocal();
    });
  }
}

function roleLabel(role) {
  return { admin: '管理员', sales: '销售', guide: '导游' }[role] || role;
}

/* 根据管理员 token 同步顶栏按钮与「管理」Tab 显隐 */
function updateAdminUI() {
  const admin = isAdmin();
  $$('.tab.admin-only').forEach((t) => { t.hidden = !admin; });
  const hasUser = !!localStorage.getItem('tuyou_token');
  if ($('#admin-enter-header')) $('#admin-enter-header').hidden = admin || !hasUser;
  if ($('#admin-logout-btn')) $('#admin-logout-btn').hidden = !admin;
  // 普通「退出」按钮：只要有用户登录态就显示（与管理员身份不冲突）
  if ($('#logout-btn')) $('#logout-btn').hidden = !hasUser;
}

/* ---------- 管理员进入（密码） ---------- */
function showAdminLogin() {
  const m = $('#admin-login-modal');
  if (!m) return;
  m.hidden = false;
  setTimeout(() => {
    const inp = m.querySelector('input[name=password]');
    if (inp) inp.focus();
  }, 30);
}

function bindAdminLogin() {
  const m = $('#admin-login-modal');
  const f = $('#admin-login-form');
  if (!m || !f) return;
  $('#admin-login-cancel').onclick = () => { m.hidden = true; };
  m.onclick = (e) => { if (e.target === m) m.hidden = true; };
  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pw = f.password.value;
    if (!pw) { toast('请输入密码'); return; }
    try {
      const r = await api.post('/admin/login', { password: pw });
      localStorage.setItem('tuyou_admin_token', r.token);
      adminSessionActive = true;
      _adminReauthShown = false;
      m.hidden = true;
      f.reset();
      if (!currentUser) {
        currentUser = { name: '管理员', role: 'admin' };
        $('#user-area').hidden = false;
        $('#user-name').textContent = '管理员';
        connectSSE(r.token); // 从登录弹窗进入也建立实时通道
      }
      updateAdminUI();
      switchView('admin');
      toast('管理员已登录');
    } catch (err) {
      if (err && err.status === 401) toast('管理员密码错误');
      else apiToast(err);
    }
  });
}

function adminLogout() {
  // 干净退出：移除管理员 token 并回到登录入口（普通与管理后台是两个独立通道）
  localStorage.removeItem('tuyou_admin_token');
  adminSessionActive = false;
  _adminReauthShown = false;
  location.reload();
}

function connectSSE(tokenOverride) {
  if (sse) return;
  const token = tokenOverride || localStorage.getItem('tuyou_token');
  if (!token) return;
  sse = new EventSource('/api/events?token=' + encodeURIComponent(token));
  sse.addEventListener('update', () => {
    clearTimeout(sseTimer);
    sseTimer = setTimeout(() => silentRefresh(), 150);
  });
  sse.onerror = () => { /* 浏览器会自动重连 */ };
}

function silentRefresh() {
  const active = document.querySelector('.view.active');
  const view = active ? active.id.replace('view-', '') : 'hall';
  if (view === 'hall') renderHall();
  else if (view === 'paired') renderPairs();
  else if (view === 'stats') renderStats();
  else if (view === 'match') renderMatchSource();
}

async function importLocal() {
  try {
    const payload = {
      orders: JSON.parse(localStorage.getItem(STORE_KEY) || '[]'),
      trips: JSON.parse(localStorage.getItem(TRIP_KEY) || '[]'),
      rooms: JSON.parse(localStorage.getItem(ROOM_KEY) || '[]'),
      pairs: JSON.parse(localStorage.getItem(PAIR_KEY) || '[]'),
    };
    const r = await api.post('/migrate', payload);
    localStorage.removeItem(STORE_KEY);
    localStorage.removeItem(TRIP_KEY);
    localStorage.removeItem(ROOM_KEY);
    localStorage.removeItem(PAIR_KEY);
    toast(`已导入 ${r.addedOrders} 条需求、${r.addedPairs} 条拼成记录`);
    await refreshAll();
  } catch (err) {
    apiToast(err);
  }
}

/* ---------- 初始化 ---------- */
function bindEvents() {
  $('#tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.tab');
    if (btn) switchView(btn.dataset.view);
  });
  $('#post-form').addEventListener('submit', handleSubmit);
  $('#post-form').addEventListener('reset', () => {
    editId = null;
    $('#post-form .btn.primary').textContent = '发布需求';
    toggleTripPop(false);
    toggleRoomPop(false);
  });
  $('#trip-add-link').addEventListener('click', () => {
    toggleTripPop($('#trip-add-pop').hidden);
    toggleRoomPop(false);
  });
  $('#trip-cancel-btn').addEventListener('click', () => toggleTripPop(false));
  $('#trip-confirm-btn').addEventListener('click', addTrip);
  $('#trip-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addTrip(); }
    if (e.key === 'Escape') { e.preventDefault(); toggleTripPop(false); }
  });
  $('#room-add-link').addEventListener('click', () => {
    toggleRoomPop($('#room-add-pop').hidden);
    toggleTripPop(false);
  });
  $('#room-cancel-btn').addEventListener('click', () => toggleRoomPop(false));
  $('#room-confirm-btn').addEventListener('click', addRoom);
  $('#room-new').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addRoom(); }
    if (e.key === 'Escape') { e.preventDefault(); toggleRoomPop(false); }
  });

  // 右键删除当前选中的行程
  $('#trip-select').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const val = $('#trip-select').value;
    if (!val) return;
    showContextMenu(e.clientX, e.clientY, val);
  });
  $('#context-menu').addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-item');
    if (!item || !ctxTarget) return;
    if (item.dataset.action === 'delete') deleteTrip(ctxTarget);
    hideContextMenu();
  });

  // 右键删除当前选中的房型
  $('#room-select').addEventListener('contextmenu', (e) => {
    e.preventDefault();
    const val = $('#room-select').value;
    if (!val) return;
    showRoomContextMenu(e.clientX, e.clientY, val);
  });
  $('#room-context-menu').addEventListener('click', (e) => {
    const item = e.target.closest('.ctx-item');
    if (!item || !roomCtxTarget) return;
    if (item.dataset.action === 'delete-room') deleteRoom(roomCtxTarget);
    hideRoomContextMenu();
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#context-menu')) hideContextMenu();
    if (!e.target.closest('#room-context-menu')) hideRoomContextMenu();
  });

  $('#filter-trip').addEventListener('input', renderHall);
  $('#filter-gender').addEventListener('change', renderHall);
  $('#filter-room').addEventListener('change', renderHall);
  $('#match-run').addEventListener('click', runMatch);

  // 行程 ↔ 日期联动：根据行程名自动识别天数，出团日期+天数自动算完团日期
  const f = $('#post-form');
  const setCheckoutFromDays = () => {
    const days = Number(f.tripDays.value);
    if (!days || !f.checkIn.value) return;
    const d = new Date(f.checkIn.value);
    d.setDate(d.getDate() + days - 1);
    f.checkOut.value = d.toISOString().slice(0, 10);
  };
  f.trip.addEventListener('change', () => {
    const days = parseTripDays(f.trip.value);
    if (days > 0) {
      f.tripDays.value = days;
      setCheckoutFromDays();
    }
  });
  f.tripDays.addEventListener('change', setCheckoutFromDays);
  f.checkIn.addEventListener('change', setCheckoutFromDays);

  const todayStr = new Date().toISOString().slice(0, 10);
  f.querySelector('[name=checkIn]').min = todayStr;
  f.querySelector('[name=checkOut]').min = todayStr;

  // 编辑弹窗：行程 ↔ 日期联动
  const ef = $('#edit-form');
  const setEditCheckoutFromDays = () => {
    const days = Number(ef.editTripDays.value);
    if (!days || !ef.editCheckIn.value) return;
    const d = new Date(ef.editCheckIn.value);
    d.setDate(d.getDate() + days - 1);
    ef.editCheckOut.value = d.toISOString().slice(0, 10);
  };
  ef.editTrip.addEventListener('change', () => {
    const days = parseTripDays(ef.editTrip.value);
    if (days > 0) { ef.editTripDays.value = days; setEditCheckoutFromDays(); }
  });
  ef.editTripDays.addEventListener('change', setEditCheckoutFromDays);
  ef.editCheckIn.addEventListener('change', setEditCheckoutFromDays);
  ef.querySelector('[name=editCheckIn]').min = todayStr;
  ef.querySelector('[name=editCheckOut]').min = todayStr;
  $('#edit-form').addEventListener('submit', handleEditSubmit);
  $('#edit-cancel').addEventListener('click', closeEditModal);
  $('#edit-modal').addEventListener('click', (e) => { if (e.target === $('#edit-modal')) closeEditModal(); });

  // 退出登录
  $('#logout-btn').addEventListener('click', () => {
    localStorage.removeItem('tuyou_token');
    if (sse) { sse.close(); sse = null; }
    location.reload();
  });

  // 管理员进入 / 退出
  bindAdminLogin();
  const adminEnterBtn = $('#admin-enter-btn');
  if (adminEnterBtn) adminEnterBtn.addEventListener('click', showAdminLogin);
  const adminEnterHeader = $('#admin-enter-header');
  if (adminEnterHeader) adminEnterHeader.addEventListener('click', showAdminLogin);
  const adminLogoutBtn = $('#admin-logout-btn');
  if (adminLogoutBtn) adminLogoutBtn.addEventListener('click', adminLogout);

  // 管理员：添加成员
  const addUserForm = $('#admin-add-user-form');
  if (addUserForm) addUserForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    await addUser();
  });

  // 管理员：修改密码
  const pwForm = $('#admin-pw-form');
  if (pwForm) pwForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const cur = pwForm.current.value;
    const nxt = pwForm.next.value;
    if (nxt.length < 4) { toast('新密码至少 4 位'); return; }
    if (!(await changeAdminPassword(cur, nxt))) return;
    pwForm.reset();
    toast('管理员密码已更新');
  });

  // 管理员：数据导出
  const ebOrders = $('#export-orders');
  if (ebOrders) ebOrders.addEventListener('click', async () => {
    const orders = await loadAdminOrders();
    if (!orders.length) { toast('暂无订单可导出'); return; }
    const headers = [
      { key: 'userName', label: '昵称' }, { key: 'gender', label: '性别' }, { key: 'age', label: '年龄' },
      { key: 'trip', label: '行程' }, { key: 'roomType', label: '房型' }, { key: 'checkIn', label: '出团' },
      { key: 'checkOut', label: '完团' }, { key: 'preferredGender', label: '偏好' }, { key: 'contact', label: '销售' },
      { key: 'owner_name', label: '归属人' }, { key: 'createdAt', label: '创建时间' },
    ];
    downloadFile('途友拼房-订单-' + dateStr() + '.csv', toCSV(orders, headers), 'text/csv');
    await logAdminAction('export', '导出订单 CSV（' + orders.length + ' 条）');
    toast('订单已导出');
  });
  const ebUsers = $('#export-users');
  if (ebUsers) ebUsers.addEventListener('click', async () => {
    const users = await loadUsers();
    if (!users.length) { toast('暂无成员可导出'); return; }
    const headers = [{ key: 'name', label: '昵称' }, { key: 'role', label: '角色' }, { key: 'created_at', label: '加入时间' }];
    downloadFile('途友拼房-成员-' + dateStr() + '.csv', toCSV(users, headers), 'text/csv');
    await logAdminAction('export', '导出成员 CSV（' + users.length + ' 条）');
    toast('成员已导出');
  });
  const ebJson = $('#export-json');
  if (ebJson) ebJson.addEventListener('click', async () => {
    let orders = [], users = [], pairs = [], trips = [], rooms = [];
    try {
      [orders, users, pairs, trips, rooms] = await Promise.all([
        loadAdminOrders(), loadUsers(), loadAdminPairs(), adminReq('/trips'), adminReq('/rooms'),
      ]);
    } catch (e) { adminApiToast(e); }
    const data = {
      exportedAt: new Date().toISOString(),
      orders, users, pairs,
      trips: (trips || []).map((t) => t.name),
      rooms: (rooms || []).map((r) => r.name),
    };
    downloadFile('途友拼房-全部-' + dateStr() + '.json', JSON.stringify(data, null, 2), 'application/json');
    await logAdminAction('export', '导出全部 JSON');
    toast('全部数据已导出');
  });
}

async function refreshAll() {
  await Promise.all([refreshTripList(), refreshRoomList(), renderMatchSource()]);
  const active = document.querySelector('.view.active');
  const view = active ? active.id.replace('view-', '') : 'post';
  if (view === 'hall') await renderHall();
  else if (view === 'paired') await renderPairs();
  else if (view === 'stats') await renderStats();
}

async function startup() {
  bindEvents();
  const token = localStorage.getItem('tuyou_token');
  const adminTok = localStorage.getItem('tuyou_admin_token');
  if (adminTok) updateAdminUI();

  if (token) {
    try {
      const me = await api.get('/me');
      currentUser = me.user;
      $('#login-modal').hidden = true;
      onLoggedIn(true); // true = 自动登录
      return;
    } catch (e) {
      // token 失效，回到登录
      localStorage.removeItem('tuyou_token');
    }
  }
  if (adminTok) {
    // 仅持管理员 token：跳过登录弹窗，直接进入管理后台
    adminSessionActive = true;
    currentUser = { name: '管理员', role: 'admin' };
    $('#login-modal').hidden = true;
    $('#user-area').hidden = false;
    $('#user-name').textContent = '管理员';
    updateAdminUI();
    connectSSE(adminTok);
    switchView('admin');
    return;
  }
  showLogin();
}

document.addEventListener('DOMContentLoaded', startup);
