import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";

test.describe("UAT-LOG-02: Login with Google account", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
  });

  test("Should open Google sign-in popup when clicking Sign in with Google", async ({ page, context }) => {
    // 1. Listen for popup before clicking
    const popupPromise = context.waitForEvent("page");

    // 2. Click Google button
    await page.getByRole("button", { name: /google/i }).click();

    // 3. Verify Google sign-in popup opens
    const popup = await popupPromise;
    await expect(popup).toHaveURL(/accounts\.google\.com/, { timeout: 10000 });
  });
});