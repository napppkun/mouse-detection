import { test, expect } from "@playwright/test";

const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
const USER_EMAIL = process.env.USER_EMAIL || "testmouse.ex@gmail.com";
const USER_PASSWORD = process.env.USER_PASSWORD || "1234567";
const MOUSE_CODE = process.env.DELETE_MOUSE_CODE || "M-DELETE";

test.describe("UAT-MOUSE-05: Delete a mouse", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should not delete when confirmation is dismissed", async ({ page }) => {
    // 1. Navigate to Mice Management
    await page.getByRole("link", { name: /mice/i }).click();
    await expect(page).toHaveURL(/manage-mice/);

    // 2. Find mouse row
    const row = page.locator("tr").filter({
      has: page.locator("td span", { hasText: MOUSE_CODE }),
    });
    await expect(row).toBeVisible();

    // 3. Dismiss confirm dialog
    page.on("dialog", async (dialog) => await dialog.dismiss());

    // 4. Click Delete
    await row.getByRole("button", { name: "Delete" }).click();

    // 5. Verify mouse still exists
    await expect(row).toBeVisible();
  });

  test("Should delete a mouse after confirmation", async ({ page }) => {
    // 1. Navigate to Mice Management
    await page.getByRole("link", { name: /mice/i }).click();
    await expect(page).toHaveURL(/manage-mice/);

    // 2. Find mouse row
    const row = page.locator("tr").filter({
      has: page.locator("td span", { hasText: MOUSE_CODE }),
    });
    await expect(row).toBeVisible();

    // 3. Handle dialogs ตามลำดับ:
    //    dialog แรก = confirm "Do you want to delete?" → accept
    //    dialog ที่สอง = alert "Delete successfully!" → accept
    let dialogCount = 0;
    page.on("dialog", async (dialog) => {
      dialogCount++;
      if (dialogCount === 1) {
        expect(dialog.message()).toContain("Do you want to delete?");
      }
      await dialog.accept();
    });

    // 4. Click Delete
    await row.getByRole("button", { name: "Delete" }).click();

    // 5. Verify mouse is removed from table
    await expect(
      page.locator("tr").filter({ has: page.locator("td span", { hasText: MOUSE_CODE }) })
    ).not.toBeVisible({ timeout: 5000 });
  });
});