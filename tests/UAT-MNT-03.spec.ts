import { test, expect } from "@playwright/test";

const BASE_URL: string = process.env.BASE_URL ?? "http://localhost:3000";
const USER_EMAIL: string = process.env.USER_EMAIL ?? "testmouse.ex@gmail.com";
const USER_PASSWORD: string = process.env.USER_PASSWORD ?? "1234567";
const MWM_VIDEO_PATH: string =
  process.env.MWM_VIDEO_PATH ?? "D:/MouseVDO/MWM/test/mwm_test.mp4";
const TEST_DATE: string = process.env.TEST_DATE ?? "";
const TEST_GROUP: string = process.env.TEST_GROUP ?? "Control";
const MOUSE_CODE: string = process.env.TEST_MOUSE_CODE_MWM ?? "M003";

test.describe("UAT-MNT-03: Create MWM test successfully (happy path)", () => {
  test.setTimeout(3_600_000); // 1 hour timeout for video processing
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should create MWM test and reach progress tray", async ({ page }) => {
    // 1. Navigate to Create Test
    await page.getByRole("link", { name: /tests/i }).click();
    await expect(page).toHaveURL(/manage-test/);
    await page.getByRole("button", { name: /create new test/i }).click();
    await expect(page).toHaveURL(/create-test/);

    // 2. Fill Test Name
    await page.locator("input.input").fill("MWM Test 01");

    // 3. Select Behavioral Test: Morris Water Maze
    await page.locator(".select-control").first().click();
    await page.getByRole("option", { name: /morris water maze/i }).click();

    // 4. Select Target Quadrant: Q1
    await expect(page.locator(".select-control").nth(2)).toBeVisible({
      timeout: 3000,
    });
    await page.locator(".select-control").nth(2).click();
    await page.getByRole("option", { name: "Q1" }).click();

    // 5. Select Date
    const dateControl = page.locator(".select-control").nth(1);
    await expect(dateControl).not.toBeDisabled({ timeout: 10000 });
    await page.waitForTimeout(3000);
    await dateControl.click();
    await expect(page.locator(".select-menu").first()).toBeVisible({
      timeout: 5000,
    });
    await expect(page.locator(".select-menu .select-empty")).not.toBeVisible({
      timeout: 10000,
    });
    await page.locator(".select-option").first().click();

    // 6. Select Group
    await expect(page.locator(".chip").first()).toBeVisible({ timeout: 5000 });
    await page.locator(".chip").filter({ hasText: TEST_GROUP }).click();

    // 7. Upload video
    await page
      .locator('input[type="file"][accept="video/*"]')
      .first()
      .setInputFiles(MWM_VIDEO_PATH);

    // 8. Assign mouse code
    await expect(page.locator(".select-control").last()).toBeVisible({
      timeout: 5000,
    });
    await page.locator(".select-control").last().click();
    await page.getByRole("option", { name: MOUSE_CODE }).click();

    // 9. Enable template checkbox
    await page.locator('input[type="checkbox"]').click();

    // 10. Click Next
    const nextBtn = page.getByRole("button", { name: /next/i });
    await expect(nextBtn).toBeEnabled({ timeout: 5000 });
    await nextBtn.click();

    // 11. TemplateDetail — upload sample video
    await expect(page).toHaveURL(/template-detail/, { timeout: 300000 });
    await page
      .locator('input[type="file"][accept="video/*"]')
      .setInputFiles(MWM_VIDEO_PATH);
    await page.waitForTimeout(2000);

    // 12. Click on overlay to create ellipse template
    const overlay = page.locator('[data-el="overlay"]');
    const box = await overlay.boundingBox();
    if (!box) throw new Error("Overlay bounding box not found");

    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(500);

    // 13. Verify ellipse is created
    await expect(overlay.locator("ellipse")).toBeVisible({ timeout: 3000 });

    // 14. Set observation time
    await page.locator('input[type="number"].input').fill("60");

    // 15. Save Template
    await page.getByRole("button", { name: /save template/i }).click();

    // 16. EditVideo — save trim and process
    await expect(page).toHaveURL(/edit-video/, { timeout: 10000 });
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForTimeout(1000);

    const processBtn = page.getByRole("button", {
      name: /process all videos/i,
    });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();

    // 17. Verify redirect and progress tray
    await expect(page).toHaveURL(/manage-test/, { timeout: 10000 });
    await expect(page.locator(".progress-tray")).toBeVisible({
      timeout: 10000,
    });
  });
});
