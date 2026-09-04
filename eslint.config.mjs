import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [
  { ignores: [".next/**", "node_modules/**", "ios/**"] },
  ...compat.extends("next/core-web-vitals"),
  // Existing native image/share renderers deliberately use plain img elements.
  { rules: { "@next/next/no-img-element": "off" } },
];
