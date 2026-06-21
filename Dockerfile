FROM node:22-alpine

RUN npm install -g pnpm

WORKDIR /app

COPY package.json ./
RUN pnpm install

COPY src ./src

CMD ["node", "src/index.js"]
