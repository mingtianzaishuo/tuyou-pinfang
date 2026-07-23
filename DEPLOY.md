# 途友拼房 · 免费服务器部署指南

## 方案：Render.com（推荐）

Render 提供免费的 Web Service（512MB RAM），支持 Docker 部署，可挂载持久化磁盘保存 SQLite 数据。

### 费用说明

| 项目 | 费用 |
|------|------|
| Web Service（运行） | 免费 |
| 持久化 Disk 1GB | $0.25/月（约 ¥1.8/月） |
| **合计** | **约 ¥1.8/月** |

> 如果完全不花钱：可以不挂 Disk，但实例休眠/重启后 SQLite 数据会丢失，仅适合体验。

### 部署步骤

1. **注册 Render** → https://render.com （用 GitHub 账号一键登录）

2. **创建 GitHub 仓库** 并把本项目代码 push 上去：
   ```bash
   git init
   git add .
   git commit -m "init"
   git remote add origin https://github.com/你的用户名/tuyou-pinfang.git
   git push -u origin main
   ```

3. **在 Render 创建服务**：
   - Dashboard → New → Blueprint
   - 选择你的 GitHub 仓库
   - Render 会自动读取 `render.yaml` 创建服务

4. **获取管理员密码**：
   - 部署完成后，进入服务 → Environment
   - 查看 `ADMIN_PASSWORD` 的值（Render 自动生成）
   - 用这个密码登录管理后台

5. **访问地址**：
   - Render 会分配一个 `https://tuyou-pinfang-xxx.onrender.com` 的域名
   - 15 分钟无人访问后实例会休眠，首次打开需等 30 秒左右唤醒

### 数据备份

SQLite 文件在容器内的 `/app/data/tuyou.db`，通过 Disk 持久化。如需手动备份：

- Render Dashboard → Shell → 执行 `cat /app/data/tuyou.db | base64` 导出
- 或在本地下载：服务页面有 Disk 备份选项

### 其他可选平台

| 平台 | 是否免费 | 持久化 | 备注 |
|------|----------|--------|------|
| Render | 运行免费 | Disk $0.25/GB/月 | 实例会休眠，国内访问一般 |
| Fly.io | 有 $5 免费额度 | 3GB 免费卷 | 需绑信用卡验证 |
| Railway | 有免费额度 | 支持 | 额度用完后需付费 |

---

如需改成完全零成本且不丢数据，可以把 SQLite 换成远程数据库（如 Turso 免费版 SQLite 或 Neon 免费版 Postgres），但这需要改代码。
