import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The imported baseline calls Date.now() only inside user-triggered handlers.
      // Keep the exact source bytes and defer any behavioral refactor to a named work packet.
      "react-hooks/purity": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // The starter D1 sample is reference material, not part of the Daily Pulse runtime.
    "examples/**",
  ]),
]);

export default eslintConfig;
