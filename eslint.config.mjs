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
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/ban-types": "off",
      "@typescript-eslint/triple-slash-reference": "off",
      "no-unused-vars": "off",
      "no-empty": "off",
      "no-useless-escape": "off",
      "no-constant-condition": "off",
      "prefer-rest-params": "off",
      "no-async-promise-executor": "off",
      "no-prototype-builtins": "off",
      "no-constant-binary-expression": "off",
    },
  },
  {
    ignores: ["node_modules/", "build/", "debug/", "gh-pages/"],
  }
);
