import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import obsidianmd from 'eslint-plugin-obsidianmd';
import reactHooks from 'eslint-plugin-react-hooks';
import { fixupPluginRules } from '@eslint/compat';
import globals from 'globals';

export default tseslint.config(
    {
        ignores: ['node_modules/**', 'dist/**', 'build/**', 'main.js', '*.min.js', 'web/**', 'docs/**', 'coverage/**', 'obsidian-dev-vault/**', 'tools/**'],
        linterOptions: {
            reportUnusedDisableDirectives: 'error'
        }
    },
    {
        ...js.configs.recommended,
        files: ['**/*.{js,cjs,mjs,ts,tsx}']
    },
    ...tseslint.configs.recommended,
    ...obsidianmd.configs.recommended,
    {
        files: ['src/**/*.{test,spec}.{ts,tsx}', 'test_helpers/**/*.{ts,tsx}', '__mocks__/**/*.ts'],
        languageOptions: {
            globals: {
                ...globals.node,
                ...globals.jest
            },
            parserOptions: {
                project: './tsconfig.eslint.json'
            }
        },
        rules: {
            // Tests may legitimately use Node built-ins (e.g. reading fixture files).
            // Keep this rule enabled for `src/**` to avoid shipping Node-only imports in the plugin runtime.
            'import/no-nodejs-modules': 'off',
            'obsidianmd/no-nodejs-modules': 'off',
            // Tests run in Node and may use test harness globals instead of Obsidian's active document.
            'obsidianmd/prefer-active-doc': 'off',
            'no-restricted-properties': [
                'error',
                {
                    object: 'describe',
                    property: 'only',
                    message: 'Do not commit describe.only()'
                },
                {
                    object: 'it',
                    property: 'only',
                    message: 'Do not commit it.only()'
                },
                {
                    object: 'test',
                    property: 'only',
                    message: 'Do not commit test.only()'
                }
            ]
        }
    },
    {
        files: ['src/**/*.{ts,tsx}'],
        ignores: ['src/**/*.{test,spec}.{ts,tsx}'],
        languageOptions: {
            ecmaVersion: 2020,
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                React: 'readonly',
                Electron: 'readonly'
            },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                },
                project: './tsconfig.json'
            }
        },
        plugins: {
            'react-hooks': fixupPluginRules(reactHooks),
            obsidianmd: obsidianmd
        },
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-unsafe-assignment': 'off',
            '@typescript-eslint/no-unsafe-member-access': 'off',
            '@typescript-eslint/no-unsafe-call': 'off',
            '@typescript-eslint/no-unsafe-argument': 'off',
            '@typescript-eslint/no-unsafe-return': 'off',
            '@typescript-eslint/no-unused-vars': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-non-null-assertion': 'off',
            '@typescript-eslint/no-floating-promises': 'off',
            '@typescript-eslint/no-misused-promises': 'off',
            '@typescript-eslint/await-thenable': 'off',
            '@typescript-eslint/no-deprecated': 'off',
            '@typescript-eslint/restrict-template-expressions': 'off',
            '@typescript-eslint/only-throw-error': 'off',
            '@typescript-eslint/no-this-alias': 'off',
            'no-undef': 'off',
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',
            'no-console': 'off',
            'no-debugger': 'error',
            'prefer-const': 'error',
            'no-var': 'error',
            'no-restricted-syntax': 'off',
            'no-alert': 'off',
            'no-unsanitized/property': 'off',
            '@microsoft/sdl/no-inner-html': 'off',
            // Upgrade the Obsidian trash rule from warn to error.
            'obsidianmd/prefer-file-manager-trash-file': 'error',
            'obsidianmd/no-static-styles-assignment': 'off',
            'obsidianmd/ui/sentence-case': 'off',
            'obsidianmd/no-tfile-tfolder-cast': 'off',
            'obsidianmd/rule-custom-message': 'off',
            'obsidianmd/prefer-active-doc': 'off',
            'preserve-caught-error': 'off',
            'no-useless-escape': 'off',

            // Type assertions
            '@typescript-eslint/no-unnecessary-type-assertion': 'warn',
            '@typescript-eslint/prefer-as-const': 'warn',

            // Code style
            eqeqeq: 'off',
            'prefer-template': 'warn', // Use template literals instead of string concatenation
            '@typescript-eslint/array-type': ['warn', { default: 'array' }], // Prefer T[] over Array<T>
            'prefer-object-spread': 'warn', // Use {...obj} instead of Object.assign()
            curly: ['warn', 'multi-line'], // Require curly braces for multi-line blocks
            'no-else-return': 'warn'
        }
    },
    {
        files: ['src/utils/eventActions.ts'],
        rules: {
            'no-restricted-syntax': 'off'
        }
    },
    {
        files: ['src/features/export-pdf/**', 'src/utils/debug.ts', 'src/utils/file-io.ts', 'src/main.ts'],
        rules: {
            'import/no-nodejs-modules': 'off',
            'obsidianmd/no-nodejs-modules': 'off'
        }
    }
);
