import { expect, test } from "@playwright/test"

/**
 * Minimal sidebar exact-active smoke for `/admin`.
 * Requires a running stack (compose web on PLAYWRIGHT_BASE_URL) and seeded admin:
 * PLAYWRIGHT_ADMIN_EMAIL / PLAYWRIGHT_ADMIN_PASSWORD.
 */
test.describe("admin sidebar", () => {
  test("login and mark /admin as exact-active", async ({ page }) => {
    const email = process.env.PLAYWRIGHT_ADMIN_EMAIL
    const password = process.env.PLAYWRIGHT_ADMIN_PASSWORD
    test.skip(!email || !password, "Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD to run")

    await page.goto("/login")
    await page.getByLabel(/email|ایمیل/i).fill(email!)
    await page.locator('input[type="password"]').fill(password!)
    await page.getByRole("button", { name: /ورود|sign in|login/i }).click()

    await page.waitForURL(/\/admin(\/|$)/, { timeout: 30_000 })
    await expect(page.getByTestId("admin-nav-main")).toBeVisible()

    const active = page.getByTestId("nav-active")
    await expect(active).toBeVisible()
    await expect(active).toHaveAttribute("href", "/admin")
  })
})
