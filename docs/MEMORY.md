# Trace — memory index

Pointer list of durable lessons, not the record itself. Keep entries to one line.
Written by `session-end`.

## Current state

- Backend and frontend scaffolded; billing (RevenueCat), Google OAuth, and both Claude endpoints
  implemented. Nothing verified against a live deploy yet.

## Lessons

- `npm test` in `frontend/` is `jest --watchAll` and never exits — always `npx jest --ci
  --watchAll=false` in any automated flow.
- `pymongo==4.9.2` + `motor==3.6.0` are pinned exactly because that pair is confirmed working on
  Railway; other combinations have broken deploys before.
- The unique index on `billing_events.event_id` is what makes RevenueCat's webhook retries safe. A
  `DuplicateKeyError` there is idempotency working, not a bug.
- Native IAP caused Gradle conflicts on the sibling Scribe project; RevenueCat
  (`react-native-purchases`) was chosen here partly to avoid re-hitting that.
