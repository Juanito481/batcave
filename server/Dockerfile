FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared/ shared/
COPY server/ server/
VOLUME /app/data
ENV BATCAVE_STATE_FILE=/app/data/state.json
EXPOSE 7777
CMD ["npx", "tsx", "server/index.ts"]
