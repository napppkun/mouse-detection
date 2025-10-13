# ---------- Build ----------
FROM node:20-slim AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---------- Run ----------
FROM nginx:alpine AS runner

# ไฟล์ build ไปไว้ที่โฟลเดอร์เสิร์ฟ
COPY --from=builder /app/build /usr/share/nginx/html

# เทมเพลตสำหรับ nginx และ env.js
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=builder /app/public/env.template.js /etc/nginx/templates/env.template.js

# สคริปต์ให้ entrypoint ของ nginx เรียกก่อนสตาร์ท
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# ให้แน่ใจว่า Cloud Run จะมีค่า PORT (แต่จริง ๆ มันฉีดมาให้)
ENV PORT=8080
CMD ["/entrypoint.sh"]