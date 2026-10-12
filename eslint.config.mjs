import js from "@eslint/js";
import { defineConfig, globalIgnores } from "eslint/config";
import prettier from "eslint-config-prettier/flat";
import globals from "globals";

export default defineConfig([
  globalIgnores([
    "dist/**",
    "node_modules/**",
    "artifacts/**",
    "output/**",
    ".playwright-cli/**",
    ".local/**",
    "local-archive/**",
    "test/fixtures/**",
    ".husky/_/**",
  ]),
  {
    files: ["**/*.{js,mjs,cjs}"],
    extends: [js.configs.recommended],
    linterOptions: { reportUnusedDisableDirectives: "error" },
    rules: {
      "no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrors: "none",
          ignoreRestSiblings: true,
        },
      ],
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },
  {
    files: [
      "src/**/*.mjs",
      "scripts/**/*.mjs",
      "mcp/**/*.mjs",
      "test/*.mjs",
      "test/helpers/*.mjs",
      "test/browser/*server.mjs",
      "*.config.mjs",
    ],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["ui/**/*.{js,mjs}", "test/browser/i18n-host.mjs"],
    languageOptions: {
      globals: { ...globals.browser, __TRIPO_BUILD_INFO__: "readonly" },
    },
  },
  {
    // Playwright snippets run in Node and evaluate callbacks inside the browser.
    files: ["test/browser/*.js"],
    languageOptions: { globals: { ...globals.node, ...globals.browser } },
  },
  prettier,
]);
