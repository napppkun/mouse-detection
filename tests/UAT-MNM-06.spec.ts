import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const USER_EMAIL = process.env.USER_EMAIL || "testmouse.ex@gmail.com";
const USER_PASSWORD = process.env.USER_PASSWORD || "1234567";
const MOUSE_CODE = process.env.TEST_MOUSE_CODE || "M001";

test.describe("UAT-MNM-06: Search mouse by code", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should filter mouse list by code", async ({ page }) => {
    // 1. Navigate to Mice Management
    await page.getByRole("link", { name: /mice/i }).click();
    await expect(page).toHaveURL(/manage-mice/);

    // 2. Type in search box
    await page.locator("input.search-pill").fill(MOUSE_CODE);

    // 3. Verify filtered results contain the code
    const rows = page.locator("tr").filter({ hasText: MOUSE_CODE });
    await expect(rows.first()).toBeVisible();
  });

  test("Should show no results for non-existing code", async ({ page }) => {
    // 1. Navigate to Mice Management
    await page.getByRole("link", { name: /mice/i }).click();
    await expect(page).toHaveURL(/manage-mice/);

    // 2. Search for non-existing code
    await page.locator("input.search-pill").fill("XXXXNOTEXIST");

    // 3. Verify no results message
    await expect(page.getByText("Data not found")).toBeVisible();
  });
});