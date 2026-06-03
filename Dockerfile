FROM oven/bun:1-alpine

WORKDIR /app

# Install opencode CLI binary (musl build for Alpine)
RUN wget -q -O /tmp/opencode.tar.gz \
    https://github.com/anomalyco/opencode/releases/download/v1.15.13/opencode-linux-x64-musl.tar.gz && \
    tar -xzf /tmp/opencode.tar.gz -C /tmp && \
    mv /tmp/opencode /usr/local/bin/opencode && \
    chmod +x /usr/local/bin/opencode && \
    rm /tmp/opencode.tar.gz

COPY package.json bun.lockb ./
RUN bun install --frozen-lockfile

COPY . .
ENV STORAGE_PATH=/app/storage

RUN chmod +x entrypoint.sh
ENTRYPOINT ["./entrypoint.sh"]
