import { test, expect } from "@playwright/test";

const BASE_URL: string = process.env.BASE_URL ?? "http://localhost:3000";
const USER_EMAIL: string = process.env.USER_EMAIL ?? "testmouse.ex@gmail.com";
const USER_PASSWORD: string = process.env.USER_PASSWORD ?? "1234567";

test.describe("UAT-MNT-04: Create test with missing Test Name", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
    await page.getByRole("link", { name: /tests/i }).click();
    await page.getByRole("link", { name: /create test/i }).click();
    await expect(page).toHaveURL(/create-test/);
  });

  test("Next button should be disabled when Test Name is empty", async ({ page }) => {
    // Select behavioral test but leave name empty
    await page.locator(".select-control").first().click();
    await page.getByRole("option", { name: /elevated plus maze/i }).click();

    const nextBtn = page.getByRole("button", { name: /next/i });
    await expect(nextBtn).toBeDisabled();
  });
});