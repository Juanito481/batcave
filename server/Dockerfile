FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared/ shared/
COPY server/ server/
EXPOSE 7777
CMD ["npx", "tsx", "server/index.ts"]
