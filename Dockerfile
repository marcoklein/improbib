FROM oven/bun:1-slim

WORKDIR /app

COPY package.json bun.lockb ./
RUN bun install --production

COPY . .

ENV PORT=5000
ENV STORAGE_PATH=/app/storage

EXPOSE 5000

CMD ["bun", "run", "src/serve.ts"]
