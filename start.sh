#!/bin/sh
# 途友拼房 · macOS / Linux 启动脚本
# 说明：Windows 用户请直接双击 start.bat（已内置 Node 运行时）。
#      Mac / Linux 用户需自行安装 Node >= 22.5，再用本项目 node_modules（纯 JS，跨平台）。
cd "$(dirname "$0")"
mkdir -p data
echo "正在启动途友拼房服务……"
echo "启动后请在浏览器打开： http://localhost:3000"
echo "（局域网同事请访问： http://你的内网IP:3000）"
node --experimental-sqlite server/index.js
