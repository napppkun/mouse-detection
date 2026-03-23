import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "admin@test.com";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "password";
const TARGET_EMAIL = process.env.TARGET_USER_EMAIL || "testmouse.ex@gmail.com";

test.describe("UAT-MNU-02: Change user role", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Admin should be able to grant admin role to a user", async ({ page }) => {
    // 1. Navigate to User Management
    await page.getByRole("link", { name: /users/i }).click();
    await expect(page).toHaveURL(/admin\/users/);

    // 2. Find target user row
    const row = page.locator("tr").filter({ hasText: TARGET_EMAIL });
    await expect(row).toBeVisible();

    // 3. Click Make admin button
    await row.getByRole("button", { name: /make admin/i }).click();

    // 4. Verify toast success message
    await expect(page.getByText("Granted admin")).toBeVisible({ timeout: 5000 });

    // 5. Verify role chip updated in table
    await expect(row.locator(".chip")).toHaveText("admin");
  });

  test("Admin should be able to revoke admin role from a user", async ({ page }) => {
    // 1. Navigate to User Management
    await page.getByRole("link", { name: /users/i }).click();
    await expect(page).toHaveURL(/admin\/users/);

    // 2. Find target user row
    const row = page.locator("tr").filter({ hasText: TARGET_EMAIL });
    await expect(row).toBeVisible();

    // 3. Click Remove admin button (if user is already admin)
    await row.getByRole("button", { name: /remove admin/i }).click();

    // 4. Verify toast success message
    await expect(page.getByText("Revoked admin")).toBeVisible({ timeout: 5000 });

    // 5. Verify role chip updated in table
    await expect(row.locator(".chip")).not.toHaveText("admin");
  });
});