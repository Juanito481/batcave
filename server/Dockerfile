FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY shared/ shared/
COPY server/ server/
RUN addgroup -S batcave && adduser -S batcave -G batcave
RUN mkdir -p /app/data && chown batcave:batcave /app/data
VOLUME /app/data
ENV BATCAVE_STATE_FILE=/app/data/state.json
USER batcave
EXPOSE 7777
CMD ["npx", "tsx", "server/index.ts"]
