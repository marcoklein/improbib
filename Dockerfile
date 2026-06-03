FROM oven/bun:1-alpine

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
ENV STORAGE_PATH=/app/storage

CMD ["bun", "run", "src/serve.ts"]
