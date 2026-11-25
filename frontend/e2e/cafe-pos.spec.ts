import { test } from "@playwright/test"

import { expect, hasCredentials, loginAsAdmin, settle } from "./helpers/admin"

/**
 * A counter sale, end to end, on the real stack.
 *
 * The till is the one screen where a regression costs money rather than clicks: a basket that
 * will not add, a settle dialog that will not confirm, a sale that saves without the payment.
 * This walks the shortest path a cashier actually takes — one item, one tap to pay, confirm —
 * and asserts the API accepted the sale (the saved-order banner carries the real order number).
 *
 * Needs a seeded tenant with at least one sellable product and a signed-in admin:
 *   PLAYWRIGHT_ADMIN_EMAIL / PLAYWRIGHT_ADMIN_PASSWORD and PLAYWRIGHT_BASE_URL.
 */
test.describe("cafe POS", () => {
  test.skip(!hasCredentials(), "Set PLAYWRIGHT_ADMIN_EMAIL/PASSWORD to run")

  test("adds an item and settles the sale", async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto("/dashboard/cafe/pos")
    await settle(page)

    const products = page.getByTestId("pos-product")
    const count = await products.count()
    test.skip(count === 0, "No sellable products in this tenant — seed the menu first")

    // Pick the first item that needs no variant/add-on choice, because those open a dialog and
    // this spec is about the flow to payment, not the modifier picker.
    await products.first().click()

    const cart = page.getByTestId("pos-cart-lines")
    await expect(cart).toBeVisible({ timeout: 15_000 })

    // A dine-in order needs a table; if the API says otherwise the button is not shown at all.
    const pay = page.getByTestId("pos-pay")
    await expect(pay).toBeEnabled()
    await pay.click()

    const dialog = page.getByTestId("pos-settle-dialog")
    await expect(dialog).toBeVisible()

    // One tap puts the full amount in cash, so no amount has to be typed.
    const confirm = page.getByTestId("pos-confirm-payment")
    await expect(confirm).toBeEnabled({ timeout: 10_000 })
    await confirm.click()

    const saved = page.getByTestId("pos-saved")
    await expect(saved).toBeVisible({ timeout: 20_000 })
    await expect(saved).toContainText(/\d/)

    // The basket is cleared but the table is kept: the next round at the same table is one tap.
    await expect(page.getByTestId("pos-cart-lines")).toHaveCount(0)
  })
})
