FROM node:22-alpine
# cache-bust: 2026-06-23b
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev

COPY src ./src

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
