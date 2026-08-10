/**
 * Lightweight unit-test setup for the PURE logic in this app.
 *
 * Deliberately NOT jest-expo / React Native Testing Library: rendering RN
 * components in Node needs a large native mock surface for very little signal.
 * What is worth testing here is the pure business logic (Turkish-safe string
 * folding, product categorisation, waste-score bucketing, score->mood tiers,
 * calendar-day expiry math). Those run fine in plain Node with ts-jest.
 *
 * `react-native` / `expo-router` are mapped to tiny stubs (see test/stubs/)
 * because two of the pure helpers happen to live next to a component in the
 * same file.
 */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/__tests__/**/*.test.ts?(x)"],
  moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],
  moduleNameMapper: {
    "^@/(.*)$": "<rootDir>/src/$1",
    "^react-native$": "<rootDir>/test/stubs/react-native.js",
    "^expo-router$": "<rootDir>/test/stubs/expo-router.js",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        tsconfig: {
          jsx: "react-jsx",
          module: "commonjs",
          target: "es2020",
          esModuleInterop: true,
          strict: true,
          skipLibCheck: true,
        },
      },
    ],
  },
};
