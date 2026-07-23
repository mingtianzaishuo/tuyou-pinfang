# 途友拼房 · 异地访问指南

## 方案一：同一局域网（最简单）

如果你的电脑和访问端连的是同一个路由器/WiFi，直接通过局域网 IP 访问。

### 1. 查本机局域网 IP
打开 PowerShell，执行：
```powershell
(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' }).IPAddress | Select-Object -First 1
```

### 2. 其他电脑访问
浏览器打开：
```
http://<你的IP>:3000
```

> 防火墙可能会拦截 3000 端口，如果访问不了，在 Windows 防火墙里允许 3000 端口入站。

---

## 方案二：ngrok 内网穿透（跨网络，免费）

适合两台电脑**不在同一个网络**（比如家里和公司）。

### 步骤 1：注册 ngrok
打开 https://dashboard.ngrok.com/signup ，用 GitHub 或邮箱注册。

### 步骤 2：获取 Authtoken
登录后进入 https://dashboard.ngrok.com/get-started/your-authtoken ，复制你的 token。

### 步骤 3：安装并配置
```powershell
# 下载 ngrok（Windows 64位）
Invoke-WebRequest -Uri "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-windows-amd64.zip" -OutFile "$env:TEMP\ngrok.zip"
Expand-Archive -Path "$env:TEMP\ngrok.zip" -DestinationPath "$env:USERPROFILE\ngrok" -Force

# 配置 authtoken（把 xxxxx 换成你的真实 token）
& "$env:USERPROFILE\ngrok\ngrok.exe" config add-authtoken xxxxx
```

### 步骤 4：启动隧道
先启动途友拼房服务（双击 `start.bat`），然后在另一个终端执行：
```powershell
& "$env:USERPROFILE\ngrok\ngrok.exe" http 3000
```

### 步骤 5：异地访问
ngrok 会显示一个公网地址，比如：
```
Forwarding: https://a1b2c3d4.ngrok-free.app -> http://localhost:3000
```

把 `https://a1b2c3d4.ngrok-free.app` 发给异地电脑，直接打开就能访问。

> ⚠️ 免费版域名每次重启 ngrok 会变，付费版（$8/月）可以绑定固定域名。

---

## 方案三：Cloudflare Tunnel（固定域名，免费）

如果你有自己的域名，这是最佳免费方案，域名固定、不限流量。

### 步骤 1：注册 Cloudflare
打开 https://dash.cloudflare.com/sign-up ，添加你的域名。

### 步骤 2：下载 cloudflared
```powershell
Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile "$env:USERPROFILE\cloudflared.exe"
```

### 步骤 3：登录授权
```powershell
& "$env:USERPROFILE\cloudflared.exe" tunnel login
```
会弹出浏览器让你登录 Cloudflare，授权即可。

### 步骤 4：创建隧道
```powershell
& "$env:USERPROFILE\cloudflared.exe" tunnel create tuyou
```

### 步骤 5：配置路由
```powershell
& "$env:USERPROFILE\cloudflared.exe" tunnel route dns tuyou tuyou.你的域名.com
```

### 步骤 6：运行
```powershell
& "$env:USERPROFILE\cloudflared.exe" tunnel run tuyou
```

---

## 推荐

| 场景 | 推荐方案 |
|------|---------|
| 同一公司/家里 WiFi | 方案一：直接用局域网 IP |
| 临时给异地看一下 | 方案二：ngrok（5分钟搞定） |
| 长期稳定使用 | 方案三：Cloudflare Tunnel 或买服务器 |
