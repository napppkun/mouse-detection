import { test, expect } from "@playwright/test";

const BASE_URL: string = process.env.BASE_URL ?? "http://localhost:3000";
const USER_EMAIL: string = process.env.USER_EMAIL ?? "testmouse.ex@gmail.com";
const USER_PASSWORD: string = process.env.USER_PASSWORD ?? "1234567";
const TEST_DATE: string = process.env.TEST_DATE ?? "";
const TEST_GROUP: string = process.env.TEST_GROUP ?? "Control";
const EPM_VIDEO_PATH: string = process.env.EPM_VIDEO_PATH ?? "D:/MouseVDO/EPM/test/epm_test.mp4";

test.describe("UAT-MNT-07: Create test without assigning mouse code", () => {
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

  test("Next button should be disabled when mouse code is not assigned to video", async ({ page }) => {
    // Fill all fields and upload video but leave mouse code unassigned
    await page.locator("input.input").fill("Test Without MouseCode");
    await page.locator(".select-control").first().click();
    await page.getByRole("option", { name: /elevated plus maze/i }).click();
    await page.locator(".select-control").nth(1).click();
    if (TEST_DATE) {
      await page.locator(".select-search").fill(TEST_DATE);
    }
    await page.locator(".select-option").first().click();
    await expect(page.locator(".chip").first()).toBeVisible({ timeout: 5000 });
    await page.locator(".chip").filter({ hasText: TEST_GROUP }).click();
    await page
      .locator('input[type="file"][accept="video/*"]')
      .first()
      .setInputFiles(EPM_VIDEO_PATH);

    // Mouse code left unassigned — Next should be disabled
    const nextBtn = page.getByRole("button", { name: /next/i });
    await expect(nextBtn).toBeDisabled();
  });
});