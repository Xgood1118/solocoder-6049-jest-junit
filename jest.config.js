module.exports = {
  projects: [
    {
      displayName: "Unit Tests",
      testMatch: ["<rootDir>/__tests__/**/*.js"],
      testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/__tests__/lib'
      ],
      testEnvironment: 'node',
      setupFilesAfterEnv: ["<rootDir>/__tests__/lib/setupTests.js"]
    },
  ],
  reporters: ['default', '.'],
  transform: {}
};
