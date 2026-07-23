途友拼房 · 一键运行说明
========================

本包为「解压即用」便携版，已内置 Node 运行环境，无需安装任何软件。

（若用记事本打开本文件中文显示乱码，请改用 VS Code / 浏览器打开，或转换编码为 UTF-8）


【Windows 用户】
1. 把整个文件夹解压到任意位置（例如桌面）。
2. 双击 start.bat 。
3. 看到命令行显示「途友拼房服务已启动」后，打开浏览器访问：
       http://localhost:3000
4. 把同一个局域网内的同事访问地址发给他们（把 localhost 换成你的内网 IP）：
       http://192.168.10.2:3000
   （你的内网 IP 可在「命令提示符」输入 ipconfig 查看「IPv4 地址」）
   ⚠️ 首次别人访问时，Windows 可能弹「是否允许访问」，请点「允许」；
      或在防火墙高级设置里放行 TCP 3000 端口。

【macOS / Linux 用户】
本便携包内置的是 Windows 版 Node，Mac / Linux 无法使用。请自行安装 Node 22.5+，
然后在本文件夹打开终端执行：
       node --experimental-sqlite server/index.js
再浏览器访问 http://localhost:3000


【重要提醒】
1. 管理员默认密码为 tuyou2026，请进入后台「安全设置」尽快修改，
   否则任何知道默认密码的人都能进后台删数据。
2. 所有数据保存在 data/tuyou.db（SQLite 文件）。备份只需复制该文件。
3. 服务运行期间，请保持 start.bat 窗口开着；关闭窗口即停止服务。
4. 想让外网（不同网络）的人也能用，请用内网穿透工具（如 ngrok /
   Cloudflare Tunnel）临时分享，或部署到云服务器。


【目录结构】
  start.bat             Windows 一键启动
  start.sh              Mac/Linux 启动脚本
  node.exe              内置 Node 运行时（Windows）
  server/               后端代码
  index.html/app.js/... 前端页面
  node_modules/         依赖（express 等）
  data/                 数据库（首次启动自动生成）
