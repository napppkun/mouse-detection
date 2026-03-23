import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const USER_EMAIL = process.env.USER_EMAIL || "testmouse.ex@gmail.com";
const USER_PASSWORD = process.env.USER_PASSWORD || "1234567";

// สูตรคำนวณ volume intake: min(weight / 200, 0.2)
const calcVolume = (weight: number) => Math.min(weight / 200, 0.2).toFixed(3);

test.describe("UAT-MNM-01: Create a new mouse successfully", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should calculate volume intake correctly based on weight", async ({ page }) => {
    // 1. Navigate to Create Mouse
    await page.getByRole("link", { name: /mice/i }).click();
    await page.getByRole("button", { name: /create mouse/i }).click();
    await expect(page).toHaveURL(/create-mouse/);

    // 2. Fill weight and verify volume is calculated correctly
    const weight = 250;
    await page.locator('input[name="weight"]').fill(String(weight));

    const volume = await page.locator('input[id="volumeIntake"]').inputValue();
    expect(volume).toBe(calcVolume(weight)); // expected: "0.125"

    // 3. Test edge case: weight that would exceed max volume (0.2 mL)
    await page.locator('input[name="weight"]').fill("500");
    const volumeCapped = await page.locator('input[id="volumeIntake"]').inputValue();
    expect(volumeCapped).toBe("0.200"); // capped at 0.2
  });

  test("Should create a mouse and appear in the list", async ({ page }) => {
    // 1. Navigate to Create Mouse
    await page.getByRole("link", { name: /mice/i }).click();
    await page.getByRole("button", { name: /create mouse/i }).click();
    await expect(page).toHaveURL(/create-mouse/);

    // 2. Fill in form
    await page.locator('input[name="code"]').fill("M001");
    await page.locator('input[name="groupName"]').fill("Control");
    await page.locator('input[name="weight"]').fill("250");

    // 3. Verify volume intake is calculated automatically
    const volume = await page.locator('input[id="volumeIntake"]').inputValue();
    expect(volume).toBe(calcVolume(250)); // "0.125"

    // 4. Submit form
    page.on("dialog", async (dialog) => await dialog.accept());
    await page.getByRole("button", { name: /submit/i }).click();

    // 5. Verify redirect to manage-mice
    await expect(page).toHaveURL(/manage-mice/, { timeout: 10000 });

    // 6. Verify newly created mouse appears in the list
    await expect(page.locator("tr").filter({ hasText: "M001" })).toBeVisible();
  });
});