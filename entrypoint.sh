#!/bin/sh
# Write opencode auth file from env var, then start the server
mkdir -p /root/.local/share/opencode
cat > /root/.local/share/opencode/auth.json << AUTH
{
  "opencode-go": {
    "type": "api",
    "key": "${OPENCODE_GO_API_KEY}"
  }
}
AUTH

exec bun run src/serve.ts
