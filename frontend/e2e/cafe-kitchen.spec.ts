import { test } from "@playwright/test"

import { expect, hasCredentials, loginAsAdmin, settle } from "./helpers/admin"

/**
 * The kitchen board, on the real stack.
 *
 * A KDS is a wall-mounted screen nobody touches with a mouse: if a ticket does not appear, or
 * a cook's tap does not advance it, the kitchen stops. This asserts the two things that have
 * to be true at every shift — the board renders tickets, and a tap moves one forward — and then
 * that the board keeps working when the network drops, because that is the failure mode that
 * silently hides orders from the people cooking them.
 */
test.describe("cafe kitchen board", () => {
  test.skip(!hasCredentials(), "Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD to run")

  test("shows tickets and advances one", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/dashboard/cafe/kitchen")
    await settle(page)

    const tickets = page.getByTestId("kds-ticket")
    const count = await tickets.count()
    test.skip(count === 0, "No open tickets — settle a counter sale first, then re-run")

    const first = tickets.first()
    const before = await first.getAttribute("data-kitchen-status")
    const orderId = await first.getAttribute("data-order-id")
    test.skip(!orderId, "Ticket carries no order id — the board is not the live feed")

    // The known-good path is the advance button; the status dropdown is the escape hatch.
    const advance = first.getByTestId("kds-advance")
    if (await advance.count()) {
      await advance.click()
    } else {
      await first.getByLabel(/set_status|وضعیت/i).selectOption({ index: 1 })
    }

    // The board re-polls every 8 seconds; the assertion waits for the server to agree rather
    // than for the local optimistic value, so a save that never reached the API fails here.
    await expect
      .poll(async () => {
        const row = page.locator(`[data-testid="kds-ticket"][data-order-id="${orderId}"]`)
        return await row.getAttribute("data-kitchen-status").catch(() => null)
      }, { timeout: 20_000 })
      .not.toBe(before)
  })

  test("keeps the tickets on screen when the API is gone", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/dashboard/cafe/kitchen")
    await settle(page)

    const tickets = page.getByTestId("kds-ticket")
    const painted = await tickets.count()
    test.skip(painted === 0, "No open tickets to cache")

    // Cut the API, not the page: the shell stays up and the next poll fails, which is exactly
    // what a rebooting router looks like to a wall tablet.
    await page.route("**/api/v1/cafe/kitchen-orders/**", (route) => route.abort())
    await page.waitForTimeout(9_000)

    // The last good board is restored from localStorage, so the wall still shows work to do.
    await expect(tickets).toHaveCount(painted)
    // And the cook is told the board is not live, rather than trusting a stale ticket silently.
    await expect(page.getByTestId("kds-stale-banner")).toBeVisible()
  })
})
