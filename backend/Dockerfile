FROM node:18-slim

WORKDIR /app

# ติดตั้ง deps แบบ production
COPY package*.json ./
RUN npm ci --omit=dev

# คัดซอร์ส
COPY . .

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080
CMD ["npm","start"]
