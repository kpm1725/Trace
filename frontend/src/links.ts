/**
 * Public URLs the app links out to.
 *
 * Defined once so the store listing and the in-app links cannot drift apart — a
 * privacy policy reachable from the listing but not from the app is a review
 * finding, and so is the reverse.
 *
 * These are static pages, not backend routes, deliberately: the API being down
 * is exactly when someone might be trying to reach them. See `docs/README.md`
 * for the hosting setup. The backend serves a copy of the deletion page at
 * `/account-deletion`, but that is a supplement rather than the canonical
 * address.
 *
 * TODO before submitting to either store: publish `docs/` and replace these
 * with the real URLs, then use the same ones in the Play Console listing, App
 * Store Connect, and the backend's PRIVACY_POLICY_URL.
 */
export const PRIVACY_POLICY_URL = "https://kpm1725.github.io/trace-privacy/";

/**
 * The account-deletion request page. Google Play requires a deletion route
 * reachable without installing the app, and this is it.
 */
export const ACCOUNT_DELETION_URL =
  "https://kpm1725.github.io/trace-privacy/data-deletion.html";

/** TODO: set a real support address and mirror it into SUPPORT_EMAIL on the backend. */
export const SUPPORT_EMAIL = "";
