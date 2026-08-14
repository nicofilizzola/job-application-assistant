import { test } from "@playwright/test";

import { removeEveryApplication } from "./helpers";

test("leave nothing behind", async () => {
  await removeEveryApplication();
});
