FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --production

COPY . .

RUN git rev-parse HEAD > /app/GIT_COMMIT 2>/dev/null || echo "unknown" > /app/GIT_COMMIT

ENV PORT=5000
ENV STORAGE_PATH=/app/storage

EXPOSE 5000

CMD ["bun", "run", "src/serve.ts"]
