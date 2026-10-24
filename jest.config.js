// Forced so a shell that already has NODE_ENV set can't point the tests at the development databases.
process.env.NODE_ENV = 'test';

const transform = { '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] };

/** @type {import('jest').Config} */
module.exports = {
  testTimeout: 15000,
  projects: [
    {
      displayName: 'unit',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/unit'],
      transform,
    },
    {
      displayName: 'integration',
      testEnvironment: 'node',
      roots: ['<rootDir>/tests/integration'],
      transform,
      globalSetup: '<rootDir>/tests/setup/global-setup.ts',
      setupFilesAfterEnv: ['<rootDir>/tests/setup/after-env.ts'],
    },
  ],
};
