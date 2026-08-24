# Public pages

The privacy policy and the account-deletion request page. Both stores require a
privacy policy URL, and Google Play additionally requires a deletion route
reachable **without installing the app**.

These are static on purpose. The backend serves a copy of the deletion page at
`GET /account-deletion`, but the canonical URLs are these: the API being down is
exactly when someone might be trying to find them, and a store review that lands
during a deploy should not see a 502.

## Hosting

Trace's repository is private, and GitHub Pages on a private repository needs a
paid plan — so mirror Scribe's arrangement and publish these from a small public
repository:

1. Create a public repo, e.g. `trace-privacy`.
2. Copy `index.html` and `data-deletion.html` into its root.
3. Settings → Pages → deploy from the `main` branch, root.
4. The URLs become:
   - `https://<user>.github.io/trace-privacy/`
   - `https://<user>.github.io/trace-privacy/data-deletion.html`
5. Put those into the Play Console and App Store Connect listings, into
   `frontend/src/links.ts`, and into the backend's `PRIVACY_POLICY_URL`.

The copies here stay in this repo so the wording is version-controlled next to
the code whose behaviour it describes.

## Before publishing

Both files have `TODO` markers for the things only you can fill in: the support
email address, and the effective date. A policy that describes behaviour the app
does not have is worse than no policy, so read them against the code rather than
assuming they are right.
