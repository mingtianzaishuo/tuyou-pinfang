/* index.js — 途友拼房后端入口
 * 单体进程：同时托管前端静态文件 + /api 接口 + SSE 实时推送。
 */
const path = require('path');
const express = require('express');
const { db } = require('./db');
const auth = require('./auth');
const { revokeUser } = auth;
const events = require('./events');

const app = express();
app.use(express.json());

const PROJECT_ROOT = path.join(__dirname, '..');
const PORT = process.env.PORT || 3000;

/* 管理员密码：以 settings 表为准（首次由 ADMIN_PASSWORD 环境变量/默认值注入），
 * 支持在后台修改并持久化。 */
function getAdminPassword() {
  const r = db.prepare("SELECT value FROM settings WHERE key='admin_password'").get();
  return r ? r.value : 'tuyou2026';
}
function setAdminPassword(pw) {
  db.prepare("INSERT INTO settings(key,value) VALUES('admin_password',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(pw);
}

/* 记录管理员操作日志（失败不影响主流程） */
function logAdmin(action, detail) {
  try {
    db.prepare('INSERT INTO admin_logs(id,action,detail,at) VALUES(?,?,?,?)')
      .run(genId('log'), String(action || ''), String(detail || ''), nowIso());
  } catch (_) { /* 日志写入失败忽略 */ }
}

/* ---------- 工具 ---------- */
const str = (v) => (typeof v === 'string' ? v.trim() : '');
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const nowIso = () => new Date().toISOString();
const genId = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

/* 校验订单字段，返回 {字段: 错误} 或 null */
function validateOrder(d) {
  const f = {};
  if (!str(d.userName)) f.userName = '昵称不能为空';
  if (!['男', '女'].includes(d.gender)) f.gender = '性别需为 男/女';
  if (!(Number(d.age) >= 0)) f.age = '年龄需为数字';
  if (!str(d.trip)) f.trip = '行程不能为空';
  if (!str(d.roomType)) f.roomType = '房型不能为空';
  if (!isDate(d.checkIn)) f.checkIn = '出团日期格式错误';
  if (!isDate(d.checkOut)) f.checkOut = '完团日期格式错误';
  if (d.checkIn && d.checkOut && d.checkOut <= d.checkIn) f.checkOut = '完团需晚于出团';
  if (!['不限', '同性别', '仅女生'].includes(d.preferredGender)) f.preferredGender = '偏好无效';
  return Object.keys(f).length ? f : null;
}

/* ---------- 鉴权中间件 ---------- */
function authMiddleware(req, res, next) {
  const m = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/);
  const token = m ? m[1] : (req.query && req.query.token); // SSE 经 query 传递（EventSource 不支持自定义头）
  if (!token) return res.status(401).json({ title: 'UNAUTHENTICATED', status: 401, detail: '缺少 token' });
  const uid = auth.userIdFromToken(token);
  if (!uid) return res.status(401).json({ title: 'UNAUTHENTICATED', status: 401, detail: 'token 无效或已过期' });
  req.userId = uid;
  next();
}

function adminMiddleware(req, res, next) {
  // 专属管理员 token（由 /api/admin/login 签发，userId = 'ADMIN'）
  if (req.userId === 'ADMIN') return next();
  const u = db.prepare('SELECT role FROM users WHERE id=?').get(req.userId);
  if (!u || u.role !== 'admin') {
    return res.status(403).json({ title: 'FORBIDDEN', status: 403, detail: '仅管理员可访问' });
  }
  next();
}

/* ---------- 静态托管（前端） ---------- */
app.use(express.static(PROJECT_ROOT));

/* ---------- 健康检查 ---------- */
app.get('/health', (req, res) => res.json({ ok: true, ts: Date.now() }));

/* ---------- 登录 / 当前用户 ---------- */
app.post('/api/login', (req, res) => {
  const name = str(req.body && req.body.name);
  if (!name) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '昵称不能为空', fields: { name: '不能为空' } });

  let u = db.prepare('SELECT * FROM users WHERE name=?').get(name);
  if (!u) {
    const id = genId('u');
    // 新用户默认「销售」；管理员身份改为密码进入（/api/admin/login），不再自动产生
    db.prepare('INSERT INTO users(id,name,role,created_at) VALUES(?,?,?,?)').run(id, name, 'sales', nowIso());
    u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  }
  const token = auth.issueToken(u.id);
  res.json({ token, user: { id: u.id, name: u.name, role: u.role } });
});

/* ---------- 管理员密码登录（专属管理员 token） ---------- */
app.post('/api/admin/login', (req, res) => {
  const pw = str(req.body && req.body.password);
  if (!pw) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '请输入管理员密码' });
  if (pw !== getAdminPassword()) return res.status(401).json({ title: 'UNAUTHENTICATED', status: 401, detail: '管理员密码错误' });
  const token = auth.issueToken('ADMIN');
  logAdmin('login', '管理员登录成功');
  res.json({ token });
});

app.get('/api/me', authMiddleware, (req, res) => {
  const u = db.prepare('SELECT id,name,role FROM users WHERE id=?').get(req.userId);
  if (!u) return res.status(401).json({ title: 'UNAUTHENTICATED', status: 401, detail: '用户不存在' });
  res.json({ user: u });
});

/* ---------- 用户管理（仅管理员） ---------- */
app.get('/api/users', authMiddleware, adminMiddleware, (req, res) => {
  const rows = db.prepare('SELECT id,name,role,created_at FROM users ORDER BY created_at DESC').all();
  res.json(rows);
});

/* 新增成员（管理员直接录入，免登录） */
app.post('/api/admin/users', authMiddleware, adminMiddleware, (req, res) => {
  const name = str(req.body && req.body.name);
  const role = ['admin', 'sales', 'guide'].includes(req.body && req.body.role) ? req.body.role : 'sales';
  if (!name) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '昵称不能为空', fields: { name: '不能为空' } });
  if (db.prepare('SELECT id FROM users WHERE name=?').get(name)) {
    return res.status(409).json({ title: 'CONFLICT', status: 409, detail: '该昵称已存在' });
  }
  const id = genId('u');
  db.prepare('INSERT INTO users(id,name,role,created_at) VALUES(?,?,?,?)').run(id, name, role, nowIso());
  logAdmin('add_user', `新增成员 ${name}（${role}）`);
  res.status(201).json({ id, name, role });
});

/* 修改成员（昵称 + 角色） */
app.put('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  const target = db.prepare('SELECT id,name,role FROM users WHERE id=?').get(id);
  if (!target) return res.status(404).json({ title: 'NOT_FOUND', status: 404, detail: '成员不存在' });

  const name = str(req.body && req.body.name) || target.name;
  const role = ['sales', 'guide', 'admin'].includes(req.body && req.body.role) ? req.body.role : target.role;

  // 昵称唯一性（排除自身）
  if (name !== target.name && db.prepare('SELECT id FROM users WHERE name=? AND id<>?').get(name, id)) {
    return res.status(409).json({ title: 'CONFLICT', status: 409, detail: '该昵称已被其他成员使用' });
  }
  // 防止把最后一个管理员降级
  if (target.role === 'admin' && role !== 'admin') {
    const adminCount = db.prepare('SELECT COUNT(*) c FROM users WHERE role=?').get('admin').c;
    if (adminCount <= 1) {
      return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '至少需要保留一名管理员' });
    }
  }

  db.prepare('UPDATE users SET name=?, role=? WHERE id=?').run(name, role, id);
  logAdmin('edit_user', `修改成员 ${target.name} → ${name}（${role}）`);
  res.json({ ok: true, id, name, role });
});

/* 强制退出某成员的所有登录态 */
app.delete('/api/admin/users/:id/sessions', authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  const target = db.prepare('SELECT id,name,role FROM users WHERE id=?').get(id);
  if (!target) return res.status(404).json({ title: 'NOT_FOUND', status: 404, detail: '成员不存在' });
  revokeUser(id);
  logAdmin('kick_user', `强制退出成员 ${target.name}`);
  res.status(204).end();
});

/* 删除成员（级联删除其需求与拼成记录） */
app.delete('/api/admin/users/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  const target = db.prepare('SELECT id,name,role FROM users WHERE id=?').get(id);
  if (!target) return res.status(404).json({ title: 'NOT_FOUND', status: 404, detail: '成员不存在' });
  // 防止删除最后一个管理员
  if (target.role === 'admin') {
    const adminCount = db.prepare('SELECT COUNT(*) c FROM users WHERE role=?').get('admin').c;
    if (adminCount <= 1) {
      return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '至少需要保留一名管理员，无法删除' });
    }
  }
  // 级联：删除其需求与关联拼成记录
  const userOrders = db.prepare('SELECT id FROM orders WHERE owner_id=?').all(id).map((r) => r.id);
  for (const oid of userOrders) {
    db.prepare('DELETE FROM pairs WHERE a=? OR b=?').run(oid, oid);
  }
  db.prepare('DELETE FROM orders WHERE owner_id=?').run(id);
  db.prepare('DELETE FROM users WHERE id=?').run(id);
  logAdmin('delete_user', `删除成员 ${target.name}`);
  events.broadcast('orders');
  events.broadcast('pairs');
  res.status(204).end();
});

/* ---------- 管理员：订单总览（全部，含归属人） ---------- */
app.get('/api/admin/orders', authMiddleware, adminMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT o.*, u.name AS owner_name
    FROM orders o LEFT JOIN users u ON u.id = o.owner_id
    ORDER BY o.createdAt DESC`).all();
  res.json(rows);
});

app.delete('/api/admin/orders/:id', authMiddleware, adminMiddleware, (req, res) => {
  db.prepare('DELETE FROM pairs WHERE a=? OR b=?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  logAdmin('delete_order', `删除需求 ${req.params.id}`);
  events.broadcast('orders');
  events.broadcast('pairs');
  res.status(204).end();
});

/* ---------- 管理员：修改密码 ---------- */
app.post('/api/admin/password', authMiddleware, adminMiddleware, (req, res) => {
  const current = str(req.body && req.body.current);
  const next = str(req.body && req.body.next);
  if (!current || !next) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '请输入当前密码与新密码' });
  if (next.length < 4) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '新密码至少 4 位' });
  if (current !== getAdminPassword()) return res.status(401).json({ title: 'UNAUTHENTICATED', status: 401, detail: '当前密码错误' });
  setAdminPassword(next);
  logAdmin('password', '管理员修改了登录密码');
  res.json({ ok: true });
});

/* ---------- 管理员：操作日志 ---------- */
app.get('/api/admin/logs', authMiddleware, adminMiddleware, (req, res) => {
  const rows = db.prepare('SELECT action,detail,at FROM admin_logs ORDER BY at DESC LIMIT 100').all();
  res.json(rows);
});

/* ---------- 管理员：记录一条日志（如导出） ---------- */
app.post('/api/admin/log', authMiddleware, adminMiddleware, (req, res) => {
  const action = str(req.body && req.body.action);
  const detail = str(req.body && req.body.detail);
  if (!action) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '动作不能为空' });
  logAdmin(action, detail);
  res.json({ ok: true });
});

/* ---------- 订单 ---------- */
app.get('/api/orders', authMiddleware, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY createdAt DESC').all();
  res.json(rows);
});

app.get('/api/orders/:id', authMiddleware, (req, res) => {
  const row = db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id);
  if (!row) return res.status(404).json({ title: 'NOT_FOUND', status: 404, detail: '需求不存在' });
  res.json(row);
});

app.post('/api/orders', authMiddleware, (req, res) => {
  const d = req.body || {};
  const v = validateOrder(d);
  if (v) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '字段校验失败', fields: v });

  const id = str(d.id) || genId('o');
  const t = nowIso();
  db.prepare(`INSERT INTO orders
    (id,userName,gender,age,trip,roomType,checkIn,checkOut,preferredGender,contact,salesNote,note,createdAt,owner_id,updated_at)
    VALUES (@id,@userName,@gender,@age,@trip,@roomType,@checkIn,@checkOut,@preferredGender,@contact,@salesNote,@note,@createdAt,@owner_id,@updated_at)`)
    .run({
      id, userName: str(d.userName), gender: str(d.gender), age: Number(d.age) || 0,
      trip: str(d.trip), roomType: str(d.roomType), checkIn: str(d.checkIn), checkOut: str(d.checkOut),
      preferredGender: str(d.preferredGender), contact: str(d.contact), salesNote: str(d.salesNote), note: str(d.note),
      createdAt: d.createdAt ? String(d.createdAt) : t, owner_id: req.userId, updated_at: t,
    });
  events.broadcast('orders');
  res.status(201).json(db.prepare('SELECT * FROM orders WHERE id=?').get(id));
});

app.put('/api/orders/:id', authMiddleware, (req, res) => {
  const existing = db.prepare('SELECT id FROM orders WHERE id=?').get(req.params.id);
  if (!existing) return res.status(404).json({ title: 'NOT_FOUND', status: 404, detail: '需求不存在' });
  const d = req.body || {};
  const v = validateOrder(d);
  if (v) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '字段校验失败', fields: v });

  db.prepare(`UPDATE orders SET
    userName=@userName,gender=@gender,age=@age,trip=@trip,roomType=@roomType,
    checkIn=@checkIn,checkOut=@checkOut,preferredGender=@preferredGender,contact=@contact,
    salesNote=@salesNote,note=@note,updated_at=@updated_at WHERE id=@id`)
    .run({
      id: req.params.id, userName: str(d.userName), gender: str(d.gender), age: Number(d.age) || 0,
      trip: str(d.trip), roomType: str(d.roomType), checkIn: str(d.checkIn), checkOut: str(d.checkOut),
      preferredGender: str(d.preferredGender), contact: str(d.contact), salesNote: str(d.salesNote), note: str(d.note),
      updated_at: nowIso(),
    });
  events.broadcast('orders');
  res.json(db.prepare('SELECT * FROM orders WHERE id=?').get(req.params.id));
});

app.delete('/api/orders/:id', authMiddleware, (req, res) => {
  // 级联删除关联拼成记录
  db.prepare('DELETE FROM pairs WHERE a=? OR b=?').run(req.params.id, req.params.id);
  db.prepare('DELETE FROM orders WHERE id=?').run(req.params.id);
  events.broadcast('orders');
  events.broadcast('pairs');
  res.status(204).end();
});

/* ---------- 行程目录 ---------- */
app.get('/api/trips', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT id,name FROM trips ORDER BY name').all());
});

app.post('/api/trips', authMiddleware, (req, res) => {
  const name = str(req.body && req.body.name);
  if (!name) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '名称不能为空' });
  try {
    const id = genId('t');
    db.prepare('INSERT INTO trips(id,name) VALUES(?,?)').run(id, name);
  } catch (e) {
    return res.status(409).json({ title: 'CONFLICT', status: 409, detail: '该行程已存在' });
  }
  events.broadcast('trips');
  res.status(201).json({ ok: true, name });
});

app.delete('/api/trips/:name', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM trips WHERE name=?').run(decodeURIComponent(req.params.name));
  events.broadcast('trips');
  res.status(204).end();
});

/* ---------- 房型目录 ---------- */
app.get('/api/rooms', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT id,name FROM rooms ORDER BY name').all());
});

app.post('/api/rooms', authMiddleware, (req, res) => {
  const name = str(req.body && req.body.name);
  if (!name) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '名称不能为空' });
  try {
    const id = genId('r');
    db.prepare('INSERT INTO rooms(id,name) VALUES(?,?)').run(id, name);
  } catch (e) {
    return res.status(409).json({ title: 'CONFLICT', status: 409, detail: '该房型已存在' });
  }
  events.broadcast('rooms');
  res.status(201).json({ ok: true, name });
});

app.delete('/api/rooms/:name', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM rooms WHERE name=?').run(decodeURIComponent(req.params.name));
  events.broadcast('rooms');
  res.status(204).end();
});

/* ---------- 拼成记录 ---------- */
app.get('/api/pairs', authMiddleware, (req, res) => {
  res.json(db.prepare('SELECT * FROM pairs ORDER BY createdAt DESC').all());
});

app.post('/api/pairs', authMiddleware, (req, res) => {
  const a = str(req.body && req.body.a);
  const b = str(req.body && req.body.b);
  if (!a || !b) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '缺少 a/b' });
  if (a === b) return res.status(422).json({ title: 'VALIDATION_ERROR', status: 422, detail: '不能和自己拼房' });
  const ex = db.prepare('SELECT id FROM pairs WHERE (a=? AND b=?) OR (a=? AND b=?)').get(a, b, b, a);
  if (ex) return res.status(409).json({ title: 'CONFLICT', status: 409, detail: '这两位已经拼成啦' });

  const id = genId('p');
  db.prepare('INSERT INTO pairs(id,a,b,createdAt,by_id) VALUES(?,?,?,?,?)').run(id, a, b, nowIso(), req.userId);
  events.broadcast('pairs');
  events.broadcast('orders');
  res.status(201).json({ id, a, b });
});

app.delete('/api/pairs/:id', authMiddleware, (req, res) => {
  db.prepare('DELETE FROM pairs WHERE id=?').run(req.params.id);
  events.broadcast('pairs');
  events.broadcast('orders');
  res.status(204).end();
});

/* ---------- 数据迁移：本地 localStorage → 服务端 ---------- */
app.post('/api/migrate', authMiddleware, (req, res) => {
  const body = req.body || {};
  const orders = Array.isArray(body.orders) ? body.orders : [];
  const trips = Array.isArray(body.trips) ? body.trips : [];
  const rooms = Array.isArray(body.rooms) ? body.rooms : [];
  const pairs = Array.isArray(body.pairs) ? body.pairs : [];
  const t = nowIso();
  let addedOrders = 0;
  let addedPairs = 0;

  for (const name of trips) {
    try { db.prepare('INSERT INTO trips(id,name) VALUES(?,?)').run(genId('t'), str(name)); } catch (_) { /* 忽略重复 */ }
  }
  for (const name of rooms) {
    try { db.prepare('INSERT INTO rooms(id,name) VALUES(?,?)').run(genId('r'), str(name)); } catch (_) { /* 忽略重复 */ }
  }
  for (const o of orders) {
    if (!o || !o.id) continue;
    const ex = db.prepare('SELECT id FROM orders WHERE id=?').get(o.id);
    if (ex) continue;
    try {
      db.prepare(`INSERT INTO orders
        (id,userName,gender,age,trip,roomType,checkIn,checkOut,preferredGender,contact,salesNote,note,createdAt,owner_id,updated_at)
        VALUES (@id,@userName,@gender,@age,@trip,@roomType,@checkIn,@checkOut,@preferredGender,@contact,@salesNote,@note,@createdAt,@owner_id,@updated_at)`)
        .run({
          id: o.id, userName: str(o.userName), gender: str(o.gender), age: Number(o.age) || 0,
          trip: str(o.trip), roomType: str(o.roomType), checkIn: str(o.checkIn), checkOut: str(o.checkOut),
          preferredGender: str(o.preferredGender), contact: str(o.contact), salesNote: str(o.salesNote), note: str(o.note),
          createdAt: o.createdAt ? String(o.createdAt) : t, owner_id: req.userId, updated_at: t,
        });
      addedOrders++;
    } catch (_) { /* 跳过坏数据 */ }
  }
  for (const p of pairs) {
    if (!p || !p.id || !p.a || !p.b) continue;
    const ex = db.prepare('SELECT id FROM pairs WHERE id=?').get(p.id);
    if (ex) continue;
    try {
      db.prepare('INSERT INTO pairs(id,a,b,createdAt,by_id) VALUES(?,?,?,?,?)').run(p.id, p.a, p.b, p.createdAt ? String(p.createdAt) : t, req.userId);
      addedPairs++;
    } catch (_) { /* 跳过坏数据 */ }
  }

  events.broadcast('orders');
  events.broadcast('pairs');
  events.broadcast('trips');
  events.broadcast('rooms');
  res.json({ addedOrders, addedPairs });
});

/* ---------- SSE 实时事件 ---------- */
app.get('/api/events', authMiddleware, (req, res) => events.handler(req, res));

/* ---------- 404 / 错误处理 ---------- */
app.use('/api', (req, res) => res.status(404).json({ title: 'NOT_FOUND', status: 404, detail: '接口不存在' }));
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error('[error]', err);
  const msg = String(err && err.message || '');
  // SQLite 唯一约束 / 外键冲突 → 409，避免返回 500 吓到前端
  if (err && (err.code === 'ERR_SQLITE_ERROR') && /constraint|unique/i.test(msg)) {
    return res.status(409).json({ title: 'CONFLICT', status: 409, detail: '数据冲突（可能已存在重复记录）' });
  }
  res.status(500).json({ title: 'INTERNAL', status: 500, detail: '服务器内部错误' });
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`途友拼房服务已启动：http://localhost:${PORT}`);
  if (!process.env.ADMIN_PASSWORD) {
    console.log('⚠️  使用默认管理员密码「tuyou2026」，生产环境请设置环境变量 ADMIN_PASSWORD');
  }
});

/* 优雅关闭 */
function shutdown() {
  console.log('\n正在关闭服务…');
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 3000);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
