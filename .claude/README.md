# Claude Code assets for Trace

Curated from [wshobson/agents](https://github.com/wshobson/agents) @ `38e19c20d2b1` (2026-08-26),
MIT licensed — see `LICENSE.wshobson-agents`.

Upstream is a plugin marketplace. `/plugin marketplace add` only works in the interactive
terminal CLI and installs into an ephemeral container, so the pieces are vendored here
instead: they load in every session (terminal, web, CI) and are version-controlled.

Selected against Trace's actual stack — **Expo SDK 52 / expo-router / RN 0.76 / TypeScript**
on the frontend, **FastAPI + motor/MongoDB + anthropic SDK + python-jose** on the backend,
**RevenueCat** for IAP, **Google OAuth** via expo-auth-session, **pytest** + **jest-expo**,
shipped through **Railway (nixpacks)** and **EAS**.

| | count | loaded |
|---|---|---|
| `agents/` | 25 | name + description always in context (~1.8k tokens) |
| `skills/` | 51 | name + description always in context (~3.4k tokens) |
| `commands/` | 43 | only when you invoke the slash command |

Always-on cost is ~5.2k tokens. The earlier unfiltered import of all 149 upstream agents
cost ~10.3k on its own.

## Agents (25)

**Mobile / frontend** — `mobile-developer`, `typescript-pro`, `frontend-developer`,
`ui-ux-designer`, `design-system-architect`

**Backend** — `fastapi-pro`, `python-pro`, `backend-architect`, `database-architect`

**Claude API** — `ai-engineer`, `prompt-engineer`

**Billing** — `payment-integration`

**Security** — `security-auditor` (OWASP, auth flaws), `mobile-security-coder`

**Quality** — `code-reviewer`, `architect-review`, `test-automator`, `debugger`,
`error-detective`, `performance-engineer`

**Ship / operate** — `deployment-engineer`, `devops-troubleshooter`, `api-documenter`

**Shipping a consumer app** — `legal-advisor` (privacy policy / ToS for store review),
`search-specialist` (dependency-compatibility research)

Upstream namespaces agents by plugin because the same agent ships in several
(`comprehensive-review-code-reviewer`). Only one variant of each is kept here, so all
carry bare names, with `name:` rewritten to match the filename. Where variants genuinely
differed, the one picked matches Trace's use: `security-auditor` from `backend-development`
(OWASP Top 10 / auth) over the DevSecOps-compliance one, `error-detective` from
`distributed-debugging` (log and stack-trace correlation), `debugger` from
`debugging-toolkit` (proactive on test failures).

## Skills (51)

React Native architecture and state, RN/iOS/Android design, design systems, TypeScript,
FastAPI templates, 15 Python skills (async, testing, error handling, type safety,
resilience, observability, packaging, …), prompt engineering and LLM evaluation, auth
implementation patterns, CI/CD and secrets management, OpenAPI generation and ADRs, WCAG
and screen-reader testing, GDPR data handling, billing automation and PCI, plus
`before-you-build` (pre-mortem) and `avoid-ai-writing`.

Skills bring their `references/` subdirectories, which is where most of the depth is.

## What was deliberately left out

Upstream ships 202 agents, 181 skills and 105 commands across 82 plugins. Excluded as
irrelevant to this stack: Kubernetes / Terraform / service mesh / multi-cloud, SQL and
PostgreSQL (Trace is MongoDB), Stripe and PayPal (RevenueCat handles IAP), RAG / vector
databases / embeddings (Trace calls Claude directly with no retrieval), LLM fine-tuning
and MLOps, blockchain, game development, quantitative trading, reverse engineering,
Django / .NET / Rust / Go / Java / Elixir and other non-stack languages, monorepo tooling,
Next.js and Tailwind, SEO, and the PPTX / social-publishing / HR toolkits.

Also skipped: the `operating-kit` agents (`deploy-with-verification`,
`prod-logs-health-check`, `session-start`, `session-end`, `code-review-preshipment`).
They are useful but ship as templates full of `{{TEST_COMMAND}}` / `{{STATE_DOC}}`
placeholders needing project-specific fill-in. Worth revisiting once deploy and health-check
commands settle.

Upstream hooks (`block-no-verify`, `protect-mcp`, `review-agent-governance`) execute code
on tool calls and were not installed.

## Updating

Re-clone upstream and re-apply the selection; nothing here links back to the upstream repo.
