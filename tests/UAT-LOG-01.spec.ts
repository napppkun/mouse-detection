import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("UAT-LOG-01: Login with registered email and password", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("Should redirect to home page after successful login", async ({ page }) => {
    // 1. Fill in email and password
    await page.locator('input[type="email"]').fill("testmouse.ex@gmail.com");
    await page.locator('input[type="password"]').fill("1234567");

    // 2. Click Sign In
    await page.getByRole("button", { name: /sign in/i }).click();

    // 3. Verify redirect to home page
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });
});