@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist "data" mkdir data
echo 正在启动途友拼房服务……
echo 启动后请在浏览器打开： http://localhost:3000
echo （局域网内的同事请访问： http://你的内网IP:3000 ，例如 http://192.168.10.2:3000）
echo.
node.exe --experimental-sqlite server/index.js
echo.
echo 服务已停止。如有报错请截图联系管理员。
pause
