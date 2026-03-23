import { test, expect, Page } from "@playwright/test";

const BASE_URL: string = process.env.BASE_URL ?? "http://localhost:3000";
const USER_EMAIL: string = process.env.USER_EMAIL ?? "testmouse.ex@gmail.com";
const USER_PASSWORD: string = process.env.USER_PASSWORD ?? "1234567";
const YMAZE_VIDEO_PATH: string =
  process.env.YMAZE_VIDEO_PATH ?? "D:/MouseVDO/Ymaze/test/ymaze_test.mp4";
const TEST_DATE: string = process.env.TEST_DATE ?? "";
const TEST_GROUP: string = process.env.TEST_GROUP ?? "Control";
const MOUSE_CODE: string = process.env.TEST_MOUSE_CODE_YMAZE ?? "M002";

async function drawRect(
  page: Page,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
): Promise<void> {
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(endX, endY, { steps: 10 });
  await page.mouse.up();
}

test.describe("UAT-MNT-02: Create YMaze test successfully (happy path)", () => {
  test.setTimeout(3_600_000); // 1 hour timeout for video processing
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should create YMaze test and reach progress tray", async ({ page }) => {
    // 1. Navigate to Create Test
    await page.getByRole("link", { name: /tests/i }).click();
    await expect(page).toHaveURL(/manage-test/);
    await page.getByRole("button", { name: /create new test/i }).click();
    await expect(page).toHaveURL(/create-test/);

    // 2. Fill Test Name
    await page.locator("input.input").fill("YMaze Test 01");

    // 3. Select Behavioral Test: Y-maze
    await page.locator(".select-control").first().click();
    await page.getByRole("option", { name: /y-maze/i }).click();

    // 4. Select Date
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

    // 5. Select Group
    await expect(page.locator(".chip").first()).toBeVisible({ timeout: 5000 });
    await page.locator(".chip").filter({ hasText: TEST_GROUP }).click();

    // 6. Upload video
    await page
      .locator('input[type="file"][accept="video/*"]')
      .first()
      .setInputFiles(YMAZE_VIDEO_PATH);

    // 7. Assign mouse code
    await expect(page.locator(".select-control").last()).toBeVisible({
      timeout: 5000,
    });
    await page.locator(".select-control").last().click();
    await page.getByRole("option", { name: MOUSE_CODE }).click();

    // 8. Enable template checkbox
    await page.locator('input[type="checkbox"]').click();

    // 9. Click Next
    const nextBtn = page.getByRole("button", { name: /next/i });
    await expect(nextBtn).toBeEnabled({ timeout: 5000 });
    await nextBtn.click();

    // 10. TemplateDetail — upload sample video
    await expect(page).toHaveURL(/template-detail/, { timeout: 300000 });
    await page
      .locator('input[type="file"][accept="video/*"]')
      .setInputFiles(YMAZE_VIDEO_PATH);
    await page.waitForTimeout(2000);

    // 11. Draw 3 regions (Arm A, B, C)
    const video = page.locator("video");
    const videoBox = await video.boundingBox();
    if (!videoBox) throw new Error("Video bounding box not found");

    const vx = videoBox.x;
    const vy = videoBox.y;
    const vw = videoBox.width;
    const vh = videoBox.height;

    // Arm A (บนซ้าย)
    await page.locator(".helper-chip").nth(0).click();
    await drawRect(
      page,
      vx + vw * 0.05,
      vy + vh * 0.22,
      vx + vw * 0.25,
      vy + vh * 0.38,
    );
    await page.waitForTimeout(500);

    // Arm B (บนขวา)
    await page.locator(".helper-chip").nth(1).click();
    await drawRect(
      page,
      vx + vw * 0.75,
      vy + vh * 0.22,
      vx + vw * 0.95,
      vy + vh * 0.38,
    );
    await page.waitForTimeout(500);

    // Arm C (ล่างกลาง)
    await page.locator(".helper-chip").nth(2).click();
    await drawRect(
      page,
      vx + vw * 0.4,
      vy + vh * 0.62,
      vx + vw * 0.6,
      vy + vh * 0.78,
    );
    await page.waitForTimeout(500);

    // 12. Set observation time
    await page.locator('input[type="number"].input').fill("300");

    // 13. Save Template
    await page.getByRole("button", { name: /save template/i }).click();

    // 14. EditVideo — save trim and process
    await expect(page).toHaveURL(/edit-video/, { timeout: 10000 });
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForTimeout(1000);

    const processBtn = page.getByRole("button", {
      name: /process all videos/i,
    });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();

    // 15. Verify redirect and progress tray
    await expect(page).toHaveURL(/manage-test/, { timeout: 10000 });
    await expect(page.locator(".progress-tray")).toBeVisible({
      timeout: 10000,
    });
  });
});
