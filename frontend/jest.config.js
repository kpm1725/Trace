/**
 * jest-expo is pinned to an exact 57.0.4 rather than a range.
 *
 * 57.0.5 peer-requires `@react-native/jest-preset@^0.86.3`, while
 * react-native 0.86.2 — the version Expo SDK 57 pins and expo-doctor blesses —
 * requires exactly 0.86.2. Bumping React Native to satisfy a test dependency is
 * the tail wagging the dog, so the test preset is held back instead. When Expo
 * moves its React Native pin to 0.86.3, this can float again.
 */
module.exports = {
  preset: "jest-expo",
  globalSetup: "<rootDir>/jest.global-setup.js",
  setupFilesAfterEnv: ["<rootDir>/jest.setup.jsx"],
  // jest does not read tsconfig `paths`, so the `@/` alias is mapped here too.
  // If one is changed without the other, imports resolve in the editor and fail
  // in tests.
  moduleNameMapper: { "^@/(.*)$": "<rootDir>/$1" },
  // Everything under app/ and src/ is TypeScript that Metro would transform;
  // node_modules ships untranspiled ESM for these packages, so jest has to
  // transform them too.
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|react-native-purchases))",
  ],
  collectCoverageFrom: ["src/**/*.{ts,tsx}", "app/**/*.tsx"],
  testMatch: ["**/__tests__/**/*.test.{ts,tsx}"],
};
