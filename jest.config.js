/* global module */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.eslint.json' }]
  },
  moduleNameMapper: {
    '\\.css$': '<rootDir>/__mocks__/styleMock.js',
    '\\.md$': '<rootDir>/__mocks__/mdMock.js'
  },
  collectCoverage: true,
  collectCoverageFrom: [
    'test_helpers/**/*.ts',
    'src/utils/format.ts',
    'src/utils/parse.ts',
    'src/utils/general.ts',
    '!test_helpers/**/*.test.ts'
  ]
};
