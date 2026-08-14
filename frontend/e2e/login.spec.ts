import { expect, test } from "@playwright/test";

// This file exercises signing in, so it must start signed out.
test.use({ storageState: { cookies: [], origins: [] } });

test("an unauthenticated visit is sent to the login page", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("the wrong password is refused and sets no cookie", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill("definitely-not-the-password");
  await page.getByRole("button", { name: "Sign in" }).click();

  // Scoped by id: Next's own route announcer also carries role="alert".
  await expect(page.locator("#password-error")).toHaveText("That password is not right.");
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.context().cookies()).toEqual([]);
});

test("the right password signs in and lands on the list", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Password").fill(process.env.E2E_APP_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();

  await expect(page.getByRole("link", { name: "New application" })).toBeVisible();

  const session = (await page.context().cookies()).find((c) => c.name === "session");
  expect(session?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).toBe("");
});
