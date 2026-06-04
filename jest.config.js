/* global module */
/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
	preset: "ts-jest",
	testEnvironment: "jsdom",
	transform: {
		"^.+\\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.eslint.json" }]
	},
	moduleNameMapper: {
		"\\.css$": "<rootDir>/__mocks__/styleMock.js",
		"\\.md$": "<rootDir>/__mocks__/mdMock.js",
	},
};
