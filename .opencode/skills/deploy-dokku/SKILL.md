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

### Auto-deploy (normal path)

Pushing to `origin main` triggers GitHub Actions which:
1. Runs `sync.sh` from `~/code/personal-infra` to converge dokku infrastructure
2. Pushes the code to `dokku@impromat.app:improbib` for deployment

Use this for all normal deploys. The manual push below is only for testing alternative branches or configurations.

### Manual push (testing only)

```bash
git push dokku main:main
```

Only use this to test a different branch or configuration before merging to main. Production deploys should always go through the auto-deploy pipeline.

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
