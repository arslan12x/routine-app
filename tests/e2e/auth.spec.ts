import { test, expect } from "@playwright/test";

test.describe("Authentication and Tasks Dashboard", () => {
  test("unauthenticated user is redirected to /login", async ({ page }) => {
    await page.goto("/tasks");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("h1")).toHaveText("Routine");
    await expect(page.locator("#identifier")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
  });

  test("shows error message with invalid credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#identifier", "invalid-user-for-testing");
    await page.fill("#password", "incorrect-password");
    await page.click('button[type="submit"]');

    const errorAlert = page.locator('p[role="alert"]');
    await expect(errorAlert).toBeVisible();
    await expect(errorAlert).toContainText("Username or password is incorrect");
  });

  test("signs in and views the /tasks dashboard", async ({ page }) => {
    const username = process.env.TEST_USER_USERNAME || process.env.INITIAL_ADMIN_USERNAME || "admin";
    const password = process.env.TEST_USER_PASSWORD || process.env.INITIAL_ADMIN_PASSWORD || "admin1234";

    await page.goto("/login");
    await page.fill("#identifier", username);
    await page.fill("#password", password);
    await page.click('button[type="submit"]');

    // Upon successful authentication, user is redirected to /tasks
    await expect(page).toHaveURL(/\/tasks/, { timeout: 15_000 });

    // Verify key elements on the tasks dashboard are rendered
    await expect(page.getByRole("button", { name: /add task/i })).toBeVisible();
    await expect(page.getByText(/day streak/i)).toBeVisible();
  });
});
