import json from "@eslint/json";
import typescriptEslint from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";
import prettier from "eslint-plugin-prettier";
import prettierConfig from "eslint-config-prettier";

export default [
  {
    env: { browser: true, es2021: true, node: true },
    ignores: ["**/*.js", "**/*.cjs", "**/*.mjs", "node_modules/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module" },
    },
    plugins: {
      "@typescript-eslint": typescriptEslint,
      prettier: prettier,
    },
    rules: {
      "no-case-declarations": "off",
      "no-constant-condition": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "prettier/prettier": "error",
    },
    extends: [
      "eslint:recommended",
      "plugin:@typescript-eslint/recommended",
      prettierConfig,
    ],
  },
  {
    files: ["**/*.json"],
    plugins: { json: json },
    language: "json",
    extends: ["json/recommended"],
  },
];