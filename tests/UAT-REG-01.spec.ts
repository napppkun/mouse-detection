import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("UAT-REG-01: Register a new user account successfully", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("Should redirect to home page after successful registration", async ({ page }) => {
    // 1. Click Sign up
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/register/);

    // 2. Fill in registration form
    await page.locator('input[name="firstName"]').fill("John");
    await page.locator('input[name="lastName"]').fill("Smith");
    await page.locator('input[name="email"]').fill("testmouse.ex@gmail.com");
    await page.locator('input[name="password"]').fill("1234567");
    await page.locator('input[name="confirmPassword"]').fill("1234567");

    // 3. Click Create Account
    await page.getByRole("button", { name: /create account/i }).click();

    // 4. Verify redirect to home page
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });
});