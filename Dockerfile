FROM node:20-alpine

WORKDIR /app
COPY package.json /app/package.json

# 安装依赖
RUN npm install --omit=dev

COPY server.js /app/server.js

ENV NODE_ENV=production
ENV PORT=8000

EXPOSE 8000
CMD ["npm", "start"]
