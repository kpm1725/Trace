/**
 * Set the public env vars before jest spawns its workers.
 *
 * `babel-preset-expo` inlines `process.env.EXPO_PUBLIC_*` at transform time, so
 * setting these inside a test file or even `setupFilesAfterEnv` is too late —
 * the constant has already been baked in as "". Workers inherit process.env
 * from here, which is early enough.
 *
 * Without this, `configureOnce()` in use-revenuecat.ts short-circuits on a
 * missing key and the SDK is never called at all — which made the paywall's
 * "store unavailable" test pass for entirely the wrong reason.
 */
module.exports = async () => {
  process.env.EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY = "test_google_public_key";
  process.env.EXPO_PUBLIC_REVENUECAT_APPLE_KEY = "test_apple_public_key";
  process.env.EXPO_PUBLIC_BACKEND_URL = "https://test.invalid";
};
