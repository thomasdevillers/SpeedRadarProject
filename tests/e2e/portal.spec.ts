import { expect, test } from "@playwright/test";

test("RoadSafe dashboard exposes fleet health and event navigation", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "One view. Every vehicle." })).toBeVisible();
  await expect(page.getByRole("heading", { name: "RSR-0001", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "All events" })).toBeVisible();

  await page.getByRole("link", { name: "Events", exact: true }).click();
  await expect(page).toHaveURL(/\/events$/);
  await expect(page.getByRole("heading", { name: "Vehicle events", exact: true })).toBeVisible();
  await expect(page.getByText("CA 482 719").first()).toBeVisible();
});

test("admin can reach client, fleet, and deployment workspaces", async ({ page }) => {
  await page.goto("/admin/clients");
  await expect(page.getByRole("heading", { name: "Clients", exact: true })).toBeVisible();
  await expect(page.locator("strong").filter({ hasText: /^RoadSafe Pilot$/ })).toBeVisible();

  await page.getByRole("link", { name: "Fleet control" }).click();
  await expect(page).toHaveURL(/\/admin\/fleet$/);
  await expect(page.getByRole("heading", { name: "Fleet control", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Reassign radar" })).toBeVisible();
  await expect(page.getByText("Current & scheduled")).toBeVisible();

  const radar = await page.locator('select[name="deviceId"]').boundingBox();
  const site = await page.locator('input[name="siteName"]').boundingBox();
  expect(radar?.width).toBeGreaterThan(300);
  expect(site?.y).toBeGreaterThan(radar?.y ?? 0);

  await page.getByRole("link", { name: "Deployments" }).click();
  await expect(page.getByRole("heading", { name: "Deployments", exact: true })).toBeVisible();
});

test("mobile navigation remains usable", async ({ page, isMobile }) => {
  test.skip(!isMobile, "mobile project only");
  await page.goto("/devices");
  await expect(page.getByRole("heading", { name: "Speed radars" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Radars", exact: true })).toBeVisible();

  await page.goto("/admin/fleet");
  const radar = await page.locator('select[name="deviceId"]').boundingBox();
  const client = await page.locator('select[name="organizationId"]').boundingBox();
  expect(client?.y).toBeGreaterThan(radar?.y ?? 0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(await page.evaluate(() => document.documentElement.clientWidth));
});
