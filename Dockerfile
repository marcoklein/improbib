FROM ghcr.io/anomalyco/opencode:latest AS opencode
FROM oven/bun:1-alpine

# Copy opencode binary from the official image.
# The official image is a Go static binary (distroless/scratch base).
# Try root-level binary first (common for Go scratch images).
COPY --from=opencode /opencode /usr/local/bin/opencode

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
ENV STORAGE_PATH=/app/storage

# Write opencode auth file from env var on startup
CMD mkdir -p /root/.local/share/opencode && \
    echo "{\"opencode-go\":{\"type\":\"api\",\"key\":\"${OPENCODE_GO_API_KEY}\"}}" > /root/.local/share/opencode/auth.json && \
    bun run src/serve.ts
