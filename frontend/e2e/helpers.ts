import { expect, type Page } from "@playwright/test";

export const STORAGE_STATE = "e2e/.auth/session.json";

function backend(path: string): string {
  return `${process.env.E2E_BACKEND_URL}${path}`;
}

function key(): Record<string, string> {
  return { "X-API-Key": process.env.E2E_BACKEND_API_KEY! };
}

/** Empties the database through the API, so the suite never depends on what ran before it. */
export async function removeEveryApplication(): Promise<number> {
  const response = await fetch(backend("/applications?include_closed=true"), { headers: key() });
  const applications = (await response.json()) as { id: string }[];

  for (const application of applications) {
    const deleted = await fetch(backend(`/applications/${application.id}`), {
      method: "DELETE",
      headers: key(),
    });
    expect(deleted.status).toBe(204);
  }
  return applications.length;
}

export async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Password").fill(process.env.E2E_APP_PASSWORD!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("link", { name: "New application" })).toBeVisible();
}

export async function createApplication(
  page: Page,
  fields: {
    title: string;
    company?: string;
    sector?: string;
    location?: string;
    rating?: string;
    status?: string;
    date: string;
  },
): Promise<void> {
  await page.goto("/applications/new");
  await page.getByLabel("Job title").fill(fields.title);
  await page.getByLabel("Company").fill(fields.company ?? "ACME");
  await page.getByLabel("Sector").fill(fields.sector ?? "Tech");
  await page.getByLabel("Location").fill(fields.location ?? "Paris");
  if (fields.rating) await page.getByLabel("Rating").selectOption(fields.rating);
  await page.getByLabel("Status").selectOption(fields.status ?? "Applied");
  await page.getByLabel("Date").fill(fields.date);
  await page.getByRole("button", { name: "Create application" }).click();
  await expect(page.getByRole("heading", { name: fields.title })).toBeVisible();
}

/**
 * Waits for the timeline to actually grow. Without that the next navigation races the server
 * action and the list is read before the update has been written.
 */
export async function addUpdate(page: Page, status: string, date: string, note?: string) {
  const entries = timeline(page).getByRole("listitem");
  const before = await entries.count();

  await page.getByLabel("Status").selectOption(status);
  await page.getByLabel("Date").fill(date);
  if (note) await page.getByLabel("Note").fill(note);
  await page.getByRole("button", { name: "Add update" }).click();

  await expect(entries).toHaveCount(before + 1);
}

/** The row for one application on the list screen, never a timeline entry. */
export function row(page: Page, title: string) {
  return page
    .getByRole("list", { name: "Applications" })
    .getByRole("listitem")
    .filter({ hasText: title });
}

export function timeline(page: Page) {
  return page.getByRole("list", { name: "Timeline" });
}
