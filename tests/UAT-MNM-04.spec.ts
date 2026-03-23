import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const USER_EMAIL = process.env.USER_EMAIL || "testmouse.ex@gmail.com";
const USER_PASSWORD = process.env.USER_PASSWORD || "1234567";
const MOUSE_CODE = process.env.TEST_MOUSE_CODE || "M001";

test.describe("UAT-MOUSE-04: Recode a mouse", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should update mouse code successfully", async ({ page }) => {
    // 1. Navigate to Mice Management
    await page.getByRole("link", { name: /mice/i }).click();
    await expect(page).toHaveURL(/manage-mice/);

    // 2. Find row before clicking Recode (span still exists)
    const row = page.locator("tr").filter({
      has: page.locator("td span", { hasText: MOUSE_CODE }),
    });
    await expect(row).toBeVisible();

    // 3. Click Recode
    await row.getByRole("button", { name: "Recode" }).click();

    // 4. After clicking, span is replaced by input — find input from tbody directly
    const input = page.locator("table tbody input.input");
    await expect(input).toBeVisible({ timeout: 3000 });
    await input.clear();
    await input.fill("M001-UPDATED");

    // 5. Click Save
    await page.getByRole("button", { name: "Save" }).click();

    // 6. Verify updated code appears in table
    await expect(
      page.locator("tr").filter({ has: page.locator("td span", { hasText: "M001-UPDATED" }) })
    ).toBeVisible({ timeout: 5000 });
  });

  test("Should cancel recode without saving", async ({ page }) => {
    // 1. Navigate to Mice Management
    await page.getByRole("link", { name: /mice/i }).click();
    await expect(page).toHaveURL(/manage-mice/);

    // 2. Find row before clicking Recode (span still exists)
    const row = page.locator("tr").filter({
      has: page.locator("td span", { hasText: MOUSE_CODE }),
    });
    await expect(row).toBeVisible();

    // 3. Click Recode
    await row.getByRole("button", { name: "Recode" }).click();

    // 4. After clicking, find input from tbody directly
    const input = page.locator("table tbody input.input");
    await expect(input).toBeVisible({ timeout: 3000 });

    // 5. Click Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // 6. Verify original code still shown as span
    await expect(
      page.locator("tr").filter({ has: page.locator("td span", { hasText: MOUSE_CODE }) })
    ).toBeVisible();
  });
});