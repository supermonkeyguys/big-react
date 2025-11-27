const { defaults } = require('jest-config');

module.exports = {
    ...defaults,
    rootDir: process.cwd(),
    modulePathIgnorePatterns: ['<rootDir>/.history'],
    moduleDirectories: [
        ...defaults.moduleDirectories,
        'dist/node_modules'
    ],
    testEnvironment: 'jsdom',
    moduleNameMapper: {
        '^scheduler$': '<rootDir>/node_modules/scheduler/unstable_mock.js',
        '^jest-react$': '<rootDir>/scripts/jest/jest-react.js',
        '^scheduler$': '<rootDir>/scripts/jest/scheduler.js',
    },
    fakeTimers: {
        enableGlobally: true,
        legacyFakeTimers: true
    },
    setupFilesAfterEnv: ['./scripts/jest/setupJest.js']
};