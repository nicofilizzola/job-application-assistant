import { expect, test } from "@playwright/test";

import {
  STORAGE_STATE,
  addUpdate,
  createApplication,
  deleteUpdate,
  editUpdate,
  openUpdateDialog,
  row,
  timeline,
} from "./helpers";

test.use({ storageState: STORAGE_STATE });

test("correcting an entry's date re-derives the current status", async ({ page }) => {
  await createApplication(page, { title: "Mistyped date", date: "2026-08-01" });
  await addUpdate(page, "Interview", "2026-08-09", "first round");

  await editUpdate(page, "first round", { date: "2026-07-25" });

  // The Applied entry is now the newest, so it is the one the badge and the list show.
  await expect(timeline(page)).toContainText("25 Jul 2026");
  await page.goto("/");
  const listed = row(page, "Mistyped date");
  await expect(listed).toContainText("Applied");
  await expect(listed).toContainText("1 Aug 2026");
});

test("correcting an entry's status and note persists", async ({ page }) => {
  await createApplication(page, { title: "Wrong status", date: "2026-08-02" });
  await addUpdate(page, "Tech test", "2026-08-10", "was actually an offer");

  await expect(timeline(page)).toContainText("Tech test");

  await editUpdate(page, "was actually an offer", { status: "Offer", note: "offer received" });

  await page.reload();
  await expect(timeline(page)).toContainText("offer received");
  await expect(timeline(page)).not.toContainText("was actually an offer");
  await page.goto("/");
  await expect(row(page, "Wrong status")).toContainText("Offer");
});

test("deleting an entry hands the current status back to the one before it", async ({ page }) => {
  await createApplication(page, { title: "Added by mistake", date: "2026-08-03" });
  await addUpdate(page, "Rejected", "2026-08-12", "wrong application");

  await page.goto("/");
  await expect(row(page, "Added by mistake")).toHaveCount(0);

  await page.goto("/?closed=shown");
  // Each list row is one Link wrapping the whole row, so there is exactly one to click.
  await row(page, "Added by mistake").getByRole("link").click();
  await deleteUpdate(page, "wrong application");

  await expect(timeline(page)).not.toContainText("wrong application");
  await page.goto("/");
  const listed = row(page, "Added by mistake");
  await expect(listed).toContainText("Applied");
  await expect(listed).toContainText("3 Aug 2026");
});

test("the only entry on a timeline offers no delete", async ({ page }) => {
  await createApplication(page, {
    title: "One entry only",
    date: "2026-08-04",
    note: "the only one",
  });

  const dialog = await openUpdateDialog(page, "the only one");

  await expect(dialog.getByRole("button", { name: "Save update" })).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Delete update" })).toHaveCount(0);
});
