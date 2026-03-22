import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("UAT-LOG-03: Login with incorrect password", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("Should display error message when password is incorrect", async ({ page }) => {
    // 1. Fill in email with wrong password
    await page.locator('input[type="email"]').fill("testmouse.ex@gmail.com");
    await page.locator('input[type="password"]').fill("00000000");

    // 2. Click Sign In
    await page.getByRole("button", { name: /sign in/i }).click();

    // 3. Verify error message is displayed
    await expect(page.getByText("Invalid email or password.")).toBeVisible({ timeout: 10000 });

    // 4. Verify page remains on login
    await expect(page).not.toHaveURL(/home/);
  });
});