import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";

test.describe("UAT-MNU-01: View user list", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Admin should see user list in Manage Users page", async ({ page }) => {
    // 1. Click Users in sidebar
    await page.getByRole("link", { name: /users/i }).click();
    await expect(page).toHaveURL(/admin\/users/);

    // 2. Verify table is visible
    await expect(page.locator("table.table")).toBeVisible();

    // 3. Verify table headers
    await expect(page.getByRole("columnheader", { name: /email/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /name/i })).toBeVisible();
    await expect(page.getByRole("columnheader", { name: /role/i })).toBeVisible();
  });
});