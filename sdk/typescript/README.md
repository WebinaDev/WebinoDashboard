# @webina/dashboard-sdk

TypeScript client for the Webino Dashboard API (cookie-first).

```bash
cd WebinoDashboard/backend && composer openapi
cd ../sdk/typescript && npm install && npm run generate && npm run build
```

```ts
import { DashboardClient } from "@webina/dashboard-sdk"

const client = new DashboardClient({
  baseUrl: "https://store.example.com",
  credentials: "include",
})

await client.login("admin@example.com", "secret")
await client.gate()
```
