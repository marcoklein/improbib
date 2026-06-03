FROM ghcr.io/anomalyco/opencode:latest AS opencode
FROM oven/bun:1-alpine

# Copy opencode binary from the official image.
COPY --from=opencode /usr/local/bin/opencode /usr/local/bin/opencode

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
ENV STORAGE_PATH=/app/storage

CMD ["bun", "run", "src/serve.ts"]
