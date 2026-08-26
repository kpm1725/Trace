# Vendored subagents

149 subagents vendored from [wshobson/agents](https://github.com/wshobson/agents)
at commit `38e19c20d2b154510b0e624a2e3e186b19b5c527` (2026-08-26).

Upstream is distributed as a Claude Code plugin marketplace. Marketplaces can only be
added with the interactive `/plugin` command in the terminal CLI, which is unavailable
in web sessions, and installs there live in an ephemeral container. Vendoring the agent
definitions into the repo makes them load in every session — terminal, web, and CI —
and puts them under version control.

Upstream is MIT licensed; see `LICENSE.upstream`.

## What was taken

Only the `agents/*.md` definitions from each upstream plugin. Upstream also ships
`commands/` (53 plugins) and `skills/` (50 plugins) that are **not** vendored here.

## Naming

Upstream namespaces every agent by its plugin (`comprehensive-review-code-reviewer`)
because the same agent is bundled into several plugins. 202 files collapse to 137
distinct names and 149 distinct bodies:

- **126 agents** appear under one name with byte-identical bodies everywhere they occur.
  These keep the bare name (`backend-architect`), with `name:` rewritten to match.
- **23 agents** across **11 names** have genuinely different bodies between plugins
  (`code-reviewer`, `debugger`, `security-auditor`, `test-automator`, `cloud-architect`,
  `database-architect`, `deployment-engineer`, `django-pro`, `error-detective`,
  `legacy-modernizer`, `performance-engineer`). Every variant is kept, kept namespaced as
  `<plugin>-<name>`, so nothing is silently dropped. Pick the one whose plugin matches
  your use case.

The `name:` field always equals the filename stem.

## Cost

Every subagent's name and description sits in the system prompt so the model can route
to it — about **10k tokens** for all 149, on every request in the repo. If that matters,
delete the ones you won't use; each file is self-contained.

## Caveats

- `arm-cortex-expert` declares `tools: []` (no tools) upstream.
- `gallery-researcher` and `image-generator` declare `mcp__meigen__*` tools that only
  resolve if that MCP server is connected.
- `model:` values in use: sonnet (52), opus (37), inherit (36), haiku (22), fable (2).

## Updating

Re-clone upstream and re-run the vendoring rules above; there is no link back to the
upstream repo from this directory.
