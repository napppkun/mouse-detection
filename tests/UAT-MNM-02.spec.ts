import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const USER_EMAIL = process.env.USER_EMAIL || "testmouse.ex@gmail.com";
const USER_PASSWORD = process.env.USER_PASSWORD || "1234567";

test.describe("UAT-MNM-02: Create a mouse with duplicate code", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should show error when using an existing mouse code", async ({ page }) => {
    // 1. Navigate to Create Mouse
    await page.getByRole("link", { name: /mice/i }).click();
    await page.getByRole("button", { name: /create mouse/i }).click();
    await expect(page).toHaveURL(/create-mouse/);

    // 2. Fill in form with existing code
    await page.locator('input[name="code"]').fill("M001");
    await page.locator('input[name="groupName"]').fill("Control");
    await page.locator('input[name="weight"]').fill("250");

    // 3. Submit and handle alert
    let alertMessage = "";
    page.on("dialog", async (dialog) => {
      alertMessage = dialog.message();
      await dialog.accept();
    });
    await page.getByRole("button", { name: /submit/i }).click();

    // 4. Verify error alert is shown
    await page.waitForTimeout(2000);
    expect(alertMessage).toMatch(/could not create|already exists|duplicate/i);

    // 5. Verify still on create-mouse page
    await expect(page).toHaveURL(/create-mouse/);
  });
});