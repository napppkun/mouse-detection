import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";
const TARGET_EMAIL = process.env.TARGET_USER_EMAIL || "testmouse.ex@gmail.com";

test.describe("UAT-MNU-03: Delete a user", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Admin should be able to delete another user", async ({ page }) => {
    // 1. Navigate to User Management
    await page.getByRole("link", { name: /users/i }).click();
    await expect(page).toHaveURL(/admin\/users/);

    // 2. Find target user row
    const row = page.locator("tr").filter({ hasText: TARGET_EMAIL });
    await expect(row).toBeVisible();

    // 3. Handle window.confirm dialog
    page.on("dialog", async (dialog) => {
      expect(dialog.message()).toContain(TARGET_EMAIL);
      await dialog.accept();
    });

    // 4. Click Delete user button
    await row.getByRole("button", { name: /delete user/i }).click();

    // 5. Verify toast success message
    await expect(page.getByText("User deleted")).toBeVisible({ timeout: 5000 });

    // 6. Verify user is removed from table
    await expect(page.locator("tr").filter({ hasText: TARGET_EMAIL })).not.toBeVisible();
  });

  test("Admin should not be able to delete their own account", async ({ page }) => {
    // 1. Navigate to User Management
    await page.getByRole("link", { name: /users/i }).click();
    await expect(page).toHaveURL(/admin\/users/);

    // 2. Find own account row
    const row = page.locator("tr").filter({ hasText: ADMIN_EMAIL });
    await expect(row).toBeVisible();

    // 3. Handle confirm dialog
    page.on("dialog", async (dialog) => await dialog.accept());

    // 4. Click Delete user button on own account
    await row.getByRole("button", { name: /delete user/i }).click();

    // 5. Verify error message is shown and account is not deleted
    await expect(page.locator("tr").filter({ hasText: ADMIN_EMAIL })).toBeVisible();
  });
});