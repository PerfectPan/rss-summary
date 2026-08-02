import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist/**", "coverage/**", "node_modules/**", "scripts/**"],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Prefer explicit return types only where inference is weak; keep noise low.
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", disallowTypeAnnotations: false },
      ],
      "no-console": ["error", { allow: ["error", "warn"] }],
    },
  },
  // Domain purity: no outer layers, no Effect, no Node IO.
  {
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/application/*", "**/infrastructure/*", "**/presentation/*", "effect", "node:*"],
              message: "domain must stay pure: no outer layers, Effect, or Node built-ins.",
            },
          ],
        },
      ],
    },
  },
  // Application may use domain + infrastructure (default wiring) but never presentation.
  {
    files: ["src/application/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["**/presentation/*"],
              message: "application must not import presentation; inject render at the entrypoint.",
            },
          ],
        },
      ],
    },
  },
);
