import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import pluginReact from "eslint-plugin-react";
import { defineConfig } from "eslint/config";

console.log()
export default defineConfig([
    {
        ignores: [
            "**/dist/**",
            "**/build/**",
            "**/coverage/**",
            "**/.turbo/**",
            "**/node_modules/**",
            "**/*.d.ts",
            "**/.cache/**",
            "**/*.spec.ts",
            "**/*.spec.tsx"
        ],
    },
    {
        files: ["**/*.ts", "**/*.tsx"],
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
            "require-await": "off",
            "@typescript-eslint/consistent-type-definitions": ["error", "type"],
            "@typescript-eslint/no-explicit-any": "off",
            "@typescript-eslint/require-await": "off",
            "@typescript-eslint/no-unused-vars": [
                "error",
                {
                    "args": "all",
                    "argsIgnorePattern": "^_",
                    "caughtErrors": "all",
                    "caughtErrorsIgnorePattern": "^_",
                    "destructuredArrayIgnorePattern": "^_",
                    "varsIgnorePattern": "^_",
                    "ignoreRestSiblings": true
                }
            ]
        }
    },
    {
        files: ["packages/frontend/src/**/*.{ts,tsx}"],
        extends: [
            pluginReact.configs.flat.recommended,
        ],
        languageOptions: {
            globals: globals.browser,
            parserOptions: {
                projectService: true,
                parser: tseslint.parser,
            }
        },
        rules: {
            "react/react-in-jsx-scope": "off",
        }
    },
    {
        files: ["packages/backend/src/**/*.ts"],
        extends: [],
        languageOptions: { globals: globals.node },
    }
]);
