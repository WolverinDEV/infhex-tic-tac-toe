import js from "@eslint/js";
import stylistic from '@stylistic/eslint-plugin';
import { defineConfig } from 'eslint/config';
import pluginReact from "eslint-plugin-react";
import simpleImportSort from "eslint-plugin-simple-import-sort";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig([
    {
        ignores: [
            `**/dist/**`,
            `**/build/**`,
            `**/coverage/**`,
            `**/.turbo/**`,
            `**/node_modules/**`,
            `**/*.d.ts`,
            `**/.cache/**`,
            `**/*.spec.ts`,
            `**/*.spec.tsx`,
        ],
    },
    {
        settings: {
            react: {
                version: `detect`,
            },
        },
    },
    {
        files: [`**/*.ts`, `**/*.tsx`],
        plugins: {
            "simple-import-sort": simpleImportSort,
        },
        extends: [
            js.configs.recommended,
            tseslint.configs.recommended,
            tseslint.configs.recommendedTypeChecked,
            tseslint.configs.stylisticTypeChecked,
            {
                languageOptions: {
                    parserOptions: {
                        projectService: true,
                        parser: tseslint.parser,
                    },
                },
            },
        ],
        rules: {
            "require-await": `off`,
            "simple-import-sort/imports": `error`,
            "simple-import-sort/exports": `error`,
            "@typescript-eslint/consistent-type-definitions": [`error`, `type`],
            "@typescript-eslint/no-explicit-any": `off`,
            "@typescript-eslint/require-await": `off`,
            "@typescript-eslint/no-unused-vars": [
                `error`,
                {
                    args: `all`,
                    argsIgnorePattern: `^_`,
                    caughtErrors: `all`,
                    caughtErrorsIgnorePattern: `^_`,
                    destructuredArrayIgnorePattern: `^_`,
                    varsIgnorePattern: `^_`,
                    ignoreRestSiblings: true,
                },
            ],
            "@typescript-eslint/switch-exhaustiveness-check": [
                `error`, {
                    considerDefaultExhaustiveForUnions: true,
                },
            ],
        },
    },
    {
        files: [`packages/frontend/src/**/*.{ts,tsx}`],
        extends: [pluginReact.configs.flat.recommended],
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                projectService: true,
                parser: tseslint.parser,
            },
        },
        rules: {
            "react/react-in-jsx-scope": `off`,
        },
    },
    {
        files: [`packages/backend/src/**/*.ts`],
        extends: [],
        languageOptions: { globals: globals.node },
    },
    {
        plugins: {
            '@stylistic': stylistic,
        },
        rules: {
            indent: `off`,
            '@stylistic/indent': [
                `error`, 4, { SwitchCase: 1 },
            ],
            '@stylistic/jsx-quotes': [`error`, `prefer-double`],
            '@stylistic/quote-props': [`error`, `as-needed`],
            '@stylistic/quotes': [`error`, `backtick`],
            '@stylistic/comma-dangle': [`error`, `always-multiline`],
            '@stylistic/array-bracket-newline': [`error`, { multiline: true, minItems: 3 }],
            '@stylistic/function-paren-newline': [`error`, `multiline-arguments`],
            '@stylistic/function-call-argument-newline': [`error`, `consistent`],
            '@stylistic/multiline-comment-style': [`error`, `starred-block`],
            '@stylistic/newline-per-chained-call': [`error`, { ignoreChainWithDepth: 2 }],
            '@stylistic/operator-linebreak': [`error`, `before`],
            '@stylistic/no-extra-semi': `error`,
            '@stylistic/semi': [`error`, `always`],
            '@stylistic/spaced-comment': [`error`, `always`],

            '@stylistic/jsx-newline': [`error`, { prevent: true, allowMultilines: true }],
            '@stylistic/jsx-closing-bracket-location': `error`,
            '@stylistic/jsx-closing-tag-location': `error`,
            '@stylistic/jsx-first-prop-new-line': [`error`, `multiline-multiprop`],
            '@stylistic/jsx-wrap-multilines': [`error`, { declaration: `parens-new-line` }],
            '@stylistic/jsx-curly-brace-presence': [`error`, { props: `never`, children: `never`, propElementValues: `always` }],
            '@stylistic/jsx-curly-spacing': [`error`, { when: `never` }],
            '@stylistic/jsx-function-call-newline': [`error`, `always`],
            '@stylistic/jsx-indent-props': [`error`, 4],
            '@stylistic/jsx-one-expression-per-line': `error`,
            '@stylistic/jsx-self-closing-comp': `error`,
            '@stylistic/jsx-tag-spacing': [`error`, { beforeSelfClosing: `proportional-always` }],
        },
    },
]);
