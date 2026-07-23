/* auth.js — 无密码轻量登录：昵称 + 角色，返回随机 token
 * token 持久化到 SQLite（tokens 表），服务重启后登录态不丢失。
 * 后续可升级：users.secret 启用口令 + JWT，token 改为 httpOnly cookie。
 */
const crypto = require('crypto');
const { db } = require('./db');

function issueToken(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT OR REPLACE INTO tokens(token,user_id,created_at) VALUES(?,?,?)')
    .run(token, String(userId), new Date().toISOString());
  return token;
}

function userIdFromToken(token) {
  if (!token) return null;
  const r = db.prepare('SELECT user_id FROM tokens WHERE token=?').get(token);
  return r ? r.user_id : null;
}

function revoke(token) {
  if (token) db.prepare('DELETE FROM tokens WHERE token=?').run(token);
}

function revokeUser(userId) {
  if (userId) db.prepare('DELETE FROM tokens WHERE user_id=?').run(String(userId));
}

module.exports = { issueToken, userIdFromToken, revoke, revokeUser };
