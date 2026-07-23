/* events.js — SSE 实时推送
 * 写操作成功后广播 event: update，前端据此静默刷新当前视图，实现"A 发布 B 立刻见"。
 */
const clients = new Set();

function handler(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write('retry: 3000\n\n');
  res.write(': connected\n\n');
  clients.add(res);

  const ping = setInterval(() => {
    try { res.write(': ping\n\n'); } catch (_) { /* ignore */ }
  }, 25000);

  req.on('close', () => {
    clearInterval(ping);
    clients.delete(res);
  });
}

function broadcast(type) {
  const payload = 'event: update\ndata: ' + JSON.stringify({ type, ts: Date.now() }) + '\n\n';
  for (const c of clients) {
    try { c.write(payload); } catch (_) { /* 断开的客户端在下一次 close 时清理 */ }
  }
}

module.exports = { handler, broadcast };
