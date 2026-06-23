FROM node:22-alpine
# cache-bust: 2026-06-23
RUN npm install -g pnpm

WORKDIR /app

# Copy lockfile + manifest first so this layer is cached unless deps change
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY src ./src

ENV NODE_ENV=production

CMD ["node", "src/index.js"]
