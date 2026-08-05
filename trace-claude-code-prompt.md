# Claude Code Prompt — Trace (Violet Seed Labs)

> Note: I've defaulted the working app name to **"Trace"** (vs. "Probe") since it reads well as both noun and verb ("trace the fault"). Swap every instance of "Trace" below if you land on "Probe" instead before you run this.

---

Build a new mobile app called **Trace**, published under my company **Violet Seed Labs**. Trace is an AI-assisted circuit debugging companion for hobby electronics: users can (1) photograph a breadboard or schematic and describe a symptom to get AI-diagnosed troubleshooting steps, or (2) describe a circuit in plain text and get a generated diagram + parts list + wiring instructions.

## Company / branding context
- Company: Violet Seed Labs
- Tagline: "Built to grow"
- Brand palette: deep violet `#4C1D95` → `#8B5CF6` gradient (primary), lavender accent `#C4B5FD`, near-black background `#1A1428`, off-white `#FAF9FB`
- Use this palette for splash screen, primary buttons, and accent elements. Dark mode is the default theme.
- Bundle ID / package naming convention: `com.violetseedlabs.trace` (iOS bundle ID and Android applicationId)
- App display name: "Trace"
- Footer/about screen should credit "Violet Seed Labs" with the tagline

## Stack (mirror the Scribe project exactly — this is a known-working pattern, don't deviate without a strong reason)
- **Frontend:** Expo SDK 52, React Native
- **Backend:** FastAPI on Railway
- **Database:** MongoDB via `motor` (async driver) — pin `pymongo==4.9.2` with `motor==3.6.0` exactly, this combo is confirmed working on Railway; other version pairs have caused deployment issues before
- **AI:** Claude API (Sonnet), using both vision (image input) and text generation
- **Auth:** Google OAuth
- **Payments:** Native in-app purchases (Apple IAP / Google Play Billing) via `expo-in-app-purchases` or `react-native-iap` — build this in from the start rather than Stripe web checkout. Note: native IAP was abandoned on Scribe due to Gradle dependency conflicts, so budget real time to resolve that properly here (check library version compatibility with the current Expo SDK 52 config plugins before scaffolding, and confirm the Gradle/Kotlin versions in the generated `android` project don't collide with the IAP library's requirements before writing feature code). I'm planning to migrate Scribe from Stripe to IAP eventually too, so a clean, reusable IAP integration pattern here is worth the extra setup time.
- **Builds:** EAS cloud builds only — no local Windows build pipeline

## Core features (MVP scope)

### 1. Debug from photo
- User uploads or takes a photo of a breadboard/schematic
- User adds a short text description of the symptom (e.g. "LED won't light," "motor stutters intermittently")
- Send image + text to Claude vision API
- Return: likely causes (ranked), suggested fix steps, and a confidence/uncertainty note where relevant (don't have Claude assert certainty it doesn't have)
- Parse response carefully — if using extended thinking, handle `ThinkingBlock` parsing the same way Scribe does before extracting the final answer

### 2. Generate from prompt
- User describes a circuit in plain text (e.g. "555 timer astable LED blinker, 9V supply")
- Claude generates: a structured circuit representation, a parts list (with common component values), and step-by-step wiring instructions
- For the diagram itself: have Claude output structured JSON (components, nodes, connections) rather than trying to generate an image directly — render that JSON client-side. Don't attempt to have Claude directly output SVG/image circuit diagrams; structured data client-rendered will be far more reliable and editable.

### 3. Component reference (lightweight, low-priority for MVP)
- Static or lightly-dynamic reference: common component pinouts, quick gotchas
- Low build priority — stub this or defer to v1.1 if it threatens MVP timeline

### 4. Project history
- Save past debug sessions and generated circuits per user, same list/detail pattern as Scribe's project history screen

## Monetization
- Mirror Scribe's chunk-based billing logic as the starting model — evaluate whether usage should be metered per-debug-session or per-generation, and confirm with me before finalizing the billing unit if it's ambiguous
- Native IAP (Apple/Google) for purchases — set up products/SKUs for both platforms, server-side receipt validation against the backend before crediting usage, and restore-purchases flow on both platforms

## Working style / constraints
- I prefer **step-by-step guidance for any manual file changes** rather than large unexplained diffs
- Use **EAS cloud builds**, not local builds
- Flag early (before writing lots of code) if any part of this MVP scope looks likely to blow up in scope or hit a Railway/Expo constraint similar to what came up on Scribe
- Specifically for IAP: do a quick spike/compatibility check on the IAP library + Expo SDK 52 + Gradle before scaffolding the full purchase flow, and flag immediately if the same Gradle conflict from Scribe resurfaces, so we can solve it once here and carry the fix back to Scribe's migration later
- Ask before making assumptions on the billing unit (see above) and on exact Claude model/version to call if it's not obvious

## Deliverable for this session
Start by scaffolding the repo structure (mirroring Scribe's layout), then set up the FastAPI backend skeleton with the MongoDB connection and Claude API client, then the Expo frontend skeleton with navigation and the two core screens (Debug from Photo, Generate from Prompt) as stubs. Confirm the scaffold with me before building out full feature logic.
