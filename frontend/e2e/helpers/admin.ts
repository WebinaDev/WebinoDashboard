import { expect, type Page } from "@playwright/test"

/**
 * Sign in as the seeded admin, or skip.
 *
 * These specs drive a real stack — a till and a kitchen board are not things a mock can
 * pretend to be, because the whole point of the assertion is that a cashier's tap and a cook's
 * tap move the same order. They therefore need `PLAYWRIGHT_ADMIN_EMAIL` / `PLAYWRIGHT_ADMIN_PASSWORD`
 * and a running API; without them they are skipped rather than failing, which keeps `npm run
 * test:e2e` usable on a laptop that is not serving a shop.
 */
export function hasCredentials(): boolean {
  return Boolean(process.env.PLAYWRIGHT_ADMIN_EMAIL && process.env.PLAYWRIGHT_ADMIN_PASSWORD)
}

export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto("/login")
  await page.getByLabel(/email|ایمیل/i).fill(process.env.PLAYWRIGHT_ADMIN_EMAIL!)
  await page.locator('input[type="password"]').fill(process.env.PLAYWRIGHT_ADMIN_PASSWORD!)
  await page.getByRole("button", { name: /ورود|sign in|login/i }).click()
  await page.waitForURL(/\/dashboard(\/|$)/, { timeout: 30_000 })
}

/** Wait for the page shell, so a slow API reads as a timeout here and not somewhere confusing. */
export async function settle(page: Page): Promise<void> {
  await page.waitForLoadState("networkidle").catch(() => {
    // Polling screens are never fully idle; a timeout here is normal, not a failure.
  })
}

export { expect }
