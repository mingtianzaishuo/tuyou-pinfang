# 途友拼房 - Docker 部署镜像
# 使用 Node 22+ 以支持内置实验性 SQLite
FROM node:22-alpine

WORKDIR /app

# 先复制依赖并安装，利用缓存层
COPY package.json ./
RUN npm install --production

# 复制全部代码
COPY . .

# SQLite 数据目录持久化挂载点
RUN mkdir -p /app/data

# 暴露服务端口
EXPOSE 3000

# 启动命令（保持实验性 SQLite 标志）
CMD ["node", "--experimental-sqlite", "server/index.js"]
