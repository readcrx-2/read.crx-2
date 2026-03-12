import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettierConfig from "eslint-config-prettier";
import globals from "globals";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettierConfig,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2021,
        ...globals.webextensions,
        app: "readonly",
        UI: "readonly",
        $$: "readonly",
        $__: "readonly",
        $_F: "readonly",
        $notice: "readonly",
        chrome: "readonly",
        mediaContainer: "readonly",
      },
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": "warn",
      "@typescript-eslint/ban-types": "warn",
      "@typescript-eslint/triple-slash-reference": "warn",
      "no-unused-vars": "warn",
      "no-empty": "warn",
      "no-useless-escape": "warn",
      "no-constant-condition": "warn",
      "prefer-rest-params": "warn",
      "no-async-promise-executor": "warn",
      "no-prototype-builtins": "warn",
      "no-constant-binary-expression": "warn",
    },
  },
  {
    ignores: ["node_modules/", "build/", "debug/", "gh-pages/"],
  }
);
