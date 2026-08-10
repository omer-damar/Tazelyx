// Minimal `expo-router` stub — see test/stubs/react-native.js for the rationale.
// Only the `router` singleton is referenced by the modules under test, and only
// inside an onPress handler that unit tests never fire.
const noop = () => {};

module.exports = {
  router: { push: noop, replace: noop, back: noop, navigate: noop },
  useLocalSearchParams: () => ({}),
  Link: () => null,
  Redirect: () => null,
  Stack: () => null,
  Tabs: () => null,
};
