import nextVitals from "eslint-config-next/core-web-vitals"

// Same flat config as WebinoERP so both page builders lint alike.
const config = [
  ...nextVitals,
  {
    rules: {
      // React Compiler rules (new in eslint-plugin-react-hooks 7 / Next 16). Warnings so
      // existing code keeps building; fix them gradually.
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/preserve-manual-memoization": "warn",
      "react-hooks/purity": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/immutability": "warn",
      "react-hooks/static-components": "warn",
      "react-hooks/use-memo": "warn",
    },
  },
  { ignores: [".next/**", "node_modules/**", "e2e/**", "public/**", "playwright-report/**", "test-results/**", "*.mjs"] },
]

export default config
