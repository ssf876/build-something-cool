import { expect, test } from "@playwright/test";

test("local upload, dedupe, evidence and persisted event review", async ({
  page,
}) => {
  test.skip(
    process.env.SIKA_LOCAL_MODE !== "true",
    "Run with the local Playwright configuration.",
  );
  await page.goto("/");
  await expect(page).toHaveURL(/\/analysis$/);
  await expect(
    page.getByRole("link", { name: "Plan", exact: true }),
  ).toHaveCount(0);
  await page
    .getByLabel("Transactions CSV")
    .setInputFiles("examples/monarch-demo.csv");
  await page.getByRole("button", { name: "Upload and analyze" }).click();
  await expect(page.getByRole("status")).toContainText(
    /Imported \d+ transactions/,
  );
  await expect(
    page.getByRole("heading", { name: "2026 summary" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Recurring monthly expenses" }),
  ).toBeVisible();
  await page
    .getByLabel("Transactions CSV")
    .setInputFiles("examples/monarch-demo.csv");
  await page.getByRole("button", { name: "Upload and analyze" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Imported 0 transactions; skipped 20 duplicates",
  );
  let event = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: /Possible move/ }) });
  await event.locator("summary").click();
  await expect(event.getByText(/City Movers/)).toBeVisible();
  await event.getByLabel("Event name").fill("My April move");
  await event.getByRole("button", { name: "Confirm / save name" }).click();
  await page.reload();
  event = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: /My April move/ }) });
  await expect(event.getByText(/Confirmed/)).toBeVisible();
  await event.getByRole("button", { name: "Dismiss", exact: true }).click();
  await page.reload();
  await expect(
    page
      .locator("article")
      .filter({ has: page.getByRole("heading", { name: /My April move/ }) }),
  ).toHaveCount(0);
  await page.getByText("Dismissed suggestions", { exact: true }).click();
  const dismissed = page.locator("form").filter({ hasText: "My April move" });
  await dismissed.getByRole("button", { name: "Restore" }).click();
  // Reset the label so the test can be rerun against its isolated DB.
  event = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: /My April move/ }) });
  await event.getByLabel("Event name").fill("Possible move");
  await event.getByRole("button", { name: "Confirm / save name" }).click();
});
