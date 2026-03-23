import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const USER_EMAIL = process.env.USER_EMAIL || "testmouse.ex@gmail.com";
const USER_PASSWORD = process.env.USER_PASSWORD || "1234567";

test.describe("UAT-MNM-03: Create a mouse with missing required fields", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should not submit when required fields are empty", async ({ page }) => {
    // 1. Navigate to Create Mouse
    await page.getByRole("link", { name: /mice/i }).click();
    await page.getByRole("button", { name: /create mouse/i }).click();
    await expect(page).toHaveURL(/create-mouse/);

    // 2. Click Submit without filling any field
    await page.getByRole("button", { name: /submit/i }).click();

    // 3. Verify still on create-mouse page (browser validation blocks submit)
    await expect(page).toHaveURL(/create-mouse/);

    // 4. Verify required attribute on code field
    await expect(page.locator('input[name="code"]')).toHaveAttribute("required");
  });
});