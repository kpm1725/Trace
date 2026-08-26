/* Test environment setup.
 *
 * @testing-library/react-native v13 registers its matchers automatically —
 * the old `extend-expect` entry point no longer exists.
 */
/**
 * react-native-purchases is a native module with no JS fallback, so it has to
 * be mocked wholesale. Tests that care about purchase behaviour override these
 * per-case; the defaults here are the "store is reachable and has nothing"
 * shape, which is what an unconfigured build sees.
 */
jest.mock("react-native-purchases", () => ({
  __esModule: true,
  default: {
    configure: jest.fn(),
    setLogLevel: jest.fn(),
    logIn: jest.fn(async () => ({})),
    logOut: jest.fn(async () => ({})),
    getCustomerInfo: jest.fn(async () => ({ entitlements: { active: {} } })),
    getOfferings: jest.fn(async () => ({ all: {} })),
    purchasePackage: jest.fn(async () => ({ customerInfo: {} })),
    restorePurchases: jest.fn(async () => ({})),
  },
  LOG_LEVEL: { DEBUG: "DEBUG" },
}));

// expo-router's imperative API. Screens under test assert on navigation calls
// rather than rendering a real navigator.
jest.mock("expo-router", () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn() }),
  useLocalSearchParams: () => ({}),
  useFocusEffect: jest.fn(),
  Redirect: () => null,
  Stack: () => null,
}));

/**
 * Native storage. AsyncStorage ships an official mock; expo-secure-store has no
 * JS fallback, so it becomes an in-memory map — which is the behaviour the
 * storage wrapper's contract actually describes.
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

jest.mock("expo-secure-store", () => {
  const store = new Map();
  return {
    getItemAsync: jest.fn(async (k) => (store.has(k) ? store.get(k) : null)),
    setItemAsync: jest.fn(async (k, v) => void store.set(k, v)),
    deleteItemAsync: jest.fn(async (k) => void store.delete(k)),
  };
});

jest.mock("react-native-safe-area-context", () => ({
  useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }),
  SafeAreaProvider: ({ children }) => children,
}));

/**
 * @expo/vector-icons loads its font asynchronously and calls setState when it
 * lands, which floods every render test with act() warnings about an update
 * nothing is waiting on. No test asserts on an icon, so it becomes a plain view
 * carrying its name for anything that wants to check which icon was chosen.
 */
jest.mock("@expo/vector-icons", () => {
  const { View } = require("react-native");
  const icon = (name) => (props) => <View testID={props.testID ?? `icon-${props.name}`} />;
  return new Proxy({}, { get: (_t, set) => icon(set) });
});

global.__DEV__ = true;
