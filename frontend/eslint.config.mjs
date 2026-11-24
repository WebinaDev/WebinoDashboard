import nextVitals from "eslint-config-next/core-web-vitals"

export default [
  ...nextVitals,
  { ignores: [".next/**", "node_modules/**", "dist/**", "e2e/**", "public/**", "playwright-report/**", "test-results/**"] },
]
