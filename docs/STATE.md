# Trace — current state

Single source of truth for what is deployed, what is broken, and what is next.
Read by `session-start`, written by `deploy-with-verification` and `session-end`.

Targeted edits only — never rewrite this file wholesale.

## Deployed

| | Value | Confirmed |
|---|---|---|
| Backend revision | `67f51d9` (origin/main) | not verified against live |
| Backend URL | https://trace-production.up.railway.app | — |
| Frontend EAS build | none recorded | — |
| Store submission | not submitted | — |

Backend deploys on merge to `main` (Railway, GitHub-connected). The API exposes no revision
marker, so "deployed revision" above is what *should* be live based on git, not something read back
from the service. See the known gap below.

## Known issues

- **No revision marker in any API response.** `GET /api/` returns a static
  `{"app":"trace","ok":true}` identical across every revision, so a deploy cannot be confirmed
  directly — only inferred from `railway logs` timestamps. Fix: return
  `os.environ["RAILWAY_GIT_COMMIT_SHA"]` from the root endpoint. Railway injects it automatically.
- **CORS is over-permissive.** `server.py` sets `allow_origins=["*"]` together with
  `allow_credentials=True`. Browsers reject that combination for credentialed requests, and it is
  too broad regardless. Should be an explicit origin list.
- **`consume_credit` is a read-modify-write.** Two concurrent requests can observe the same
  remaining balance. Not currently guarded by an atomic `$inc`.
- **Deprecated FastAPI lifecycle hooks.** `@app.on_event("startup"/"shutdown")` should become a
  lifespan handler.
- **RevenueCat product ids are unverified from this repo.** `CREDIT_PRODUCTS` and
  `UNLIMITED_PRODUCT_ID` in `backend/billing.py` must match the RevenueCat dashboard. A mismatch
  is silent — the user is charged and logs `Purchase of unrecognized product_id`. Verified only by
  a real purchase test.
- **`eas.json` carries placeholder values.** `appleId`, `ascAppId`, `appleTeamId` and the
  development-profile backend URL are unset. Submission will fail until filled.

## Next up

- Not set. Update at session-end.

## Commands

```bash
cd backend  && python -m pytest -q            # backend tests (mongomock, no live DB)
cd frontend && npx jest --ci --watchAll=false # frontend tests — NOT `npm test`, which watches forever
cd frontend && npx tsc --noEmit               # typecheck; jest-expo does not typecheck
curl -s https://trace-production.up.railway.app/api/   # liveness (not revision)
railway logs --lines 500                      # production logs
```
