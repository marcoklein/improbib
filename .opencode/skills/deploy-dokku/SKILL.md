---
name: deploy-dokku
description: Deploy the improbib app to dokku on impromat.app. Use when the user asks to deploy, ship, or push to production.
compatibility: opencode
metadata:
  project: improbib
  infra_repo: ~/code/personal-infra
  app: improbib
  server: impromat.app
  remote: dokku@impromat.app:improbib
---

## What I do

- Deploy the improbib Bun app to dokku on impromat.app
- Trigger normalization after deployment
- Check deployment status and logs

## Pre-requisites

- `git remote dokku` must point to `dokku@impromat.app:improbib`
- Infrastructure is managed at `~/code/personal-infra` — app config at `apps/improbib.sh`
- Env vars (including `OPENCODE_GO_API_KEY`) are set via `dokku config:set` in the infra repo
- A `Dockerfile` must exist at the project root — Bun-based, starts `src/serve.ts`

## Deployment workflow

### 1. Deploy code

```bash
git push dokku main:main
```

Dokku builds the Dockerfile, runs the container on port 5000. The server auto-scrapes on schedule (daily at 4 AM UTC) and serves a REST API.

### 2. Wait for deploy

```bash
ssh dokku@impromat.app ps:report improbib --format json
```

Check container is running and healthy.

### 3. Trigger normalization

```bash
curl -X POST https://improbib.impromat.app/api/normalize
```

This starts the 3-stage normalization pipeline (extraction → cross-source matching → vocabulary normalization) on all raw sources.

### 4. Check progress

```bash
curl https://improbib.impromat.app/ | jq .normalizeProgress
```

Returns `{ stage, sourceName, processed, total, split, errors }`.

### 5. View results

```bash
curl https://improbib.impromat.app/normalized/improwiki.json | jq '.meta'
```

Normalized output is served via `/normalized/{source}.json` and `vocabulary.json`.

### 6. View logs

```bash
ssh dokku@impromat.app logs improbib
```

## Infrastructure changes

If infra needs updating (env vars, storage, domain), edit `~/code/personal-infra/apps/improbib.sh` and push to the personal-infra main branch. GitHub Actions runs `sync.sh` to converge the server.
