import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("UAT-REG-02: Submit registration form with missing required fields", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("Should not proceed when all fields are left empty", async ({ page }) => {
    // 1. Click Sign up
    await page.getByRole("link", { name: /sign up/i }).click();
    await expect(page).toHaveURL(/register/);

    // 2. Click Create Account without filling any field
    await page.getByRole("button", { name: /create account/i }).click();

    // 3. Verify page remains on register
    await expect(page).toHaveURL(/register/);

    // 4. Verify first name field has required attribute
    const firstName = page.locator('input[name="firstName"]');
    await expect(firstName).toHaveAttribute("required");

    // 5. Verify no server error message is shown
    await expect(page.locator("p.p")).not.toBeVisible();
  });
});