import js from "@eslint/js";
import globals from "globals";

const browserFiles = ["www/**/*.js"];
const nodeFiles = ["scripts/**/*.{js,cjs,mjs}", "tests/**/*.{js,cjs,mjs}", "*.config.mjs"];
const inlineScriptProcessor = {
  preprocess(source) {
    return [...source.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map(
      (match) => match[1]
    );
  },
  postprocess(messageGroups) {
    return messageGroups.flat();
  },
};

export default [
  {
    ignores: [
      ".build/**",
      ".agents/**",
      ".claude/**",
      "assets/**",
      "data/**",
      "ios/**",
      "node_modules/**",
      "playwright-report/**",
      "test-results/**",
      "vendor/**",
      "www/assets/**",
      "www/winnable-deals.js",
    ],
  },
  js.configs.recommended,
  {
    files: browserFiles,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: globals.browser,
    },
  },
  {
    files: ["www/**/*.html"],
    processor: inlineScriptProcessor,
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "script",
      globals: {
        ...globals.browser,
        DealEngine: "readonly",
        WINNABLE_DEAL_CORPUS: "readonly",
        SolitaireCopy: "readonly",
        SolitairePersistence: "readonly",
        SolitaireRules: "readonly",
      },
    },
  },
  {
    files: nodeFiles,
    languageOptions: {
      ecmaVersion: "latest",
      globals: globals.node,
    },
  },
  {
    files: ["tests/**/*.{js,cjs,mjs}"],
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // Playwright callbacks are serialized into the browser, where app globals
      // such as P, G, cards, and layout exist only at runtime.
      "no-undef": "off",
    },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
    },
  },
];
