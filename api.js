/* api.js — 前端 fetch 封装
 * 同源部署：BASE = location.origin + '/api'
 * 自动注入 Bearer token；非 2xx 抛出带 status/payload 的错误。
 */
const API_BASE = location.origin + '/api';

const api = {
  _token() {
    return localStorage.getItem('tuyou_token');
  },
  async req(path, opt = {}) {
    // opt.token 可覆盖默认 token（用于管理员专属接口携带管理员 token）
    // 默认优先普通用户 token；若不存在则用管理员 token 兜底 ——
    // 管理员用密码进入后台后也能正常调用普通接口，避免后续被弹「输入昵称」登录框。
    const token = ('token' in opt) ? opt.token : (this._token() || localStorage.getItem('tuyou_admin_token'));
    const headers = Object.assign(
      { 'Content-Type': 'application/json' },
      token ? { Authorization: 'Bearer ' + token } : {},
      opt.headers || {}
    );
    const res = await fetch(API_BASE + path, Object.assign({}, opt, { headers }));
    if (!res.ok) {
      let payload;
      try { payload = await res.json(); } catch (_) { payload = { title: 'ERR', status: res.status }; }
      const err = new Error(payload.detail || payload.title || ('HTTP ' + res.status));
      err.status = res.status;
      err.payload = payload;
      throw err;
    }
    if (res.status === 204) return null;
    return res.json();
  },
  get: (p) => api.req(p),
  post: (p, d) => api.req(p, { method: 'POST', body: JSON.stringify(d) }),
  put: (p, d) => api.req(p, { method: 'PUT', body: JSON.stringify(d) }),
  del: (p) => api.req(p, { method: 'DELETE' }),
};
