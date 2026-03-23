import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("UAT-REG-03: Submit registration form with mismatched passwords", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("Should display error message when password and confirm password do not match", async ({ page }) => {
    // 1. Click Sign up
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/register/);

    // 2. Fill in form with mismatched passwords
    await page.locator('input[name="firstName"]').fill("John");
    await page.locator('input[name="lastName"]').fill("Smith");
    await page.locator('input[name="email"]').fill("testmouse.ex@gmail.com");
    await page.locator('input[name="password"]').fill("1234567");
    await page.locator('input[name="confirmPassword"]').fill("0000000");

    // 3. Click Create Account
    await page.getByRole("button", { name: /create account/i }).click();

    // 4. Verify error message is displayed
    await expect(page.locator("p.p")).toBeVisible();
    await expect(page.locator("p.p")).toHaveText("Passwords do not match.");

    // 5. Verify page remains on register
    await expect(page).toHaveURL(/register/);
  });
});