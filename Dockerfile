FROM ghcr.io/anomalyco/opencode:latest AS opencode
FROM oven/bun:1-alpine

# Copy opencode binary from the official image.
# Entrypoint in official image is 'opencode' in PATH.
COPY --from=opencode /usr/local/bin/opencode /usr/local/bin/opencode

WORKDIR /app
COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
ENV STORAGE_PATH=/app/storage

# Write opencode auth from env var on container start
RUN printf '#!/bin/sh\nmkdir -p /root/.local/share/opencode\nprintf '"'"'{"opencode-go":{"type":"api","key":"%s"}}\n'"'"' "$OPENCODE_GO_API_KEY" > /root/.local/share/opencode/auth.json\nexec bun run src/serve.ts\n' > /entrypoint.sh && chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
