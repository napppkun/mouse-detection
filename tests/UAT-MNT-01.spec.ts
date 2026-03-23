import { test, expect, Page } from "@playwright/test";

const BASE_URL: string = process.env.BASE_URL ?? "http://localhost:3000";
const USER_EMAIL: string = process.env.USER_EMAIL ?? "testmouse.ex@gmail.com";
const USER_PASSWORD: string = process.env.USER_PASSWORD ?? "1234567";
const EPM_VIDEO_PATH: string =
  process.env.EPM_VIDEO_PATH ?? "D:/MouseVDO/EPM/test/epm_test.mp4";
const TEST_DATE: string = process.env.TEST_DATE ?? "";
const TEST_GROUP: string = process.env.TEST_GROUP ?? "Control";
const MOUSE_CODE: string = process.env.TEST_MOUSE_CODE_EPM ?? "M001";

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

test.describe("UAT-MNT-01: Create EPM test successfully (happy path)", () => {
  test.setTimeout(3_600_000); // 1 hour timeout for video processing
  test.beforeEach(async ({ page }) => {
    await page.goto(BASE_URL);
    await page.locator('input[type="email"]').fill(USER_EMAIL);
    await page.locator('input[type="password"]').fill(USER_PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await expect(page).toHaveURL(/home/, { timeout: 10000 });
  });

  test("Should create EPM test and reach progress tray", async ({ page }) => {
    // 1. Navigate to Create Test
    await page.getByRole("link", { name: /tests/i }).click();
    await expect(page).toHaveURL(/manage-test/);
    await page.getByRole("button", { name: /create new test/i }).click();
    await expect(page).toHaveURL(/create-test/);

    // 2. Fill Test Name
    await page.locator("input.input").fill("EPM Test 01");

    // 3. Select Behavioral Test: Elevated Plus Maze
    await page.locator(".select-control").first().click();
    await page.getByRole("option", { name: /elevated plus maze/i }).click();

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

    // 6. Upload video file
    await page
      .locator('input[type="file"][accept="video/*"]')
      .first()
      .setInputFiles(EPM_VIDEO_PATH);

    // 7. Assign mouse code to video
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

    // 10. TemplateDetail page — upload sample video
    await expect(page).toHaveURL(/template-detail/, { timeout: 300000 });
    await page
      .locator('input[type="file"][accept="video/*"]')
      .setInputFiles(EPM_VIDEO_PATH);
    await page.waitForTimeout(2000);

    // 11. Draw 4 regions on video overlay
    const video = page.locator("video");
    const videoBox = await video.boundingBox();
    if (!videoBox) throw new Error("Video bounding box not found");

    // คำนวณ offset ให้วาดอยู่ในพื้นที่วิดีโอจริง
    const vx = videoBox.x;
    const vy = videoBox.y;
    const vw = videoBox.width;
    const vh = videoBox.height;

    // วาด Open Arm 1 (บนซ้ายมุม — เล็กมาก ห่างกันมาก)
    await page.locator(".helper-chip").nth(0).click();
    await drawRect(
      page,
      vx + vw * 0.05,
      vy + vh * 0.22,
      vx + vw * 0.25,
      vy + vh * 0.38,
    );
    await page.waitForTimeout(500);

    // วาด Open Arm 2 (บนขวามุม — ห่างจากซ้ายมาก)
    await page.locator(".helper-chip").nth(1).click();
    await drawRect(
      page,
      vx + vw * 0.75,
      vy + vh * 0.22,
      vx + vw * 0.95,
      vy + vh * 0.38,
    );
    await page.waitForTimeout(500);

    // วาด Closed Arm 1 (ล่างซ้ายมุม — ห่างจากบนมาก)
    await page.locator(".helper-chip").nth(2).click();
    await drawRect(
      page,
      vx + vw * 0.05,
      vy + vh * 0.62,
      vx + vw * 0.25,
      vy + vh * 0.78,
    );
    await page.waitForTimeout(500);

    // วาด Closed Arm 2 (ล่างขวามุม — ห่างทุกด้าน)
    await page.locator(".helper-chip").nth(3).click();
    await drawRect(
      page,
      vx + vw * 0.75,
      vy + vh * 0.62,
      vx + vw * 0.95,
      vy + vh * 0.78,
    );
    await page.waitForTimeout(500);

    // 12. Set observation time
    await page.locator('input[type="number"].input').fill("300");

    // 13. Save Template
    await page.getByRole("button", { name: /save template/i }).click();

    // 14. EditVideo page — save trim
    await expect(page).toHaveURL(/edit-video/, { timeout: 10000 });
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForTimeout(1000);

    // 15. Click Process All Videos
    const processBtn = page.getByRole("button", {
      name: /process all videos/i,
    });
    await expect(processBtn).toBeEnabled({ timeout: 5000 });
    await processBtn.click();

    // 16. Verify redirect and progress tray
    await expect(page).toHaveURL(/manage-test/, { timeout: 10000 });
    await expect(page.locator(".progress-tray")).toBeVisible({
      timeout: 10000,
    });
  });
});
