import { test } from "@playwright/test";

import { STORAGE_STATE, removeEveryApplication, signIn } from "./helpers";

test("empty the database", async () => {
  await removeEveryApplication();
});

test("sign in once and keep the session", async ({ page }) => {
  await signIn(page);
  await page.context().storageState({ path: STORAGE_STATE });
});
