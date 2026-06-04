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
- Guide through testing normalization with a subset before running the full pipeline
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

### Wait for deploy

```bash
# Poll until version matches the latest commit
curl -s https://improbib.host.impromat.app:5000/api/version | jq .version
```

### Fast feedback loop (developing the normalization layer)

Normalization does NOT auto-trigger on startup. Test with a subset first:

```bash
# Test with 5 elements per source (skips Stages 2 & 3)
curl -X POST "https://improbib.host.impromat.app:5000/api/normalize?max=5"
```

Check progress:
```bash
curl -s https://improbib.host.impromat.app:5000/ | jq .normalizeProgress
```

Once the subset output looks good (no schema errors in logs), run the full pipeline:
```bash
curl -X POST "https://improbib.host.impromat.app:5000/api/normalize"
```

### View results

```bash
# Check metadata
curl -s https://improbib.host.impromat.app:5000/normalized/improwiki.json | jq '.meta'

# Check a specific element
curl -s https://improbib.host.impromat.app:5000/normalized/improwiki.json | jq '.elements[0].normalized'

# View vocabulary output (after Stage 3)
curl -s https://improbib.host.impromat.app:5000/vocabulary.json | jq '.mechanics[:3]'
```

### View logs

```bash
ssh admin@impromat.app "sudo docker logs \$(sudo docker ps -q -f 'name=improbib.web' | head -1) 2>&1 | tail -50"
```

## Infrastructure changes

If infra needs updating (env vars, storage, domain), edit `~/code/personal-infra/apps/improbib.sh` and push to the personal-infra main branch. GitHub Actions runs `sync.sh` to converge the server.
