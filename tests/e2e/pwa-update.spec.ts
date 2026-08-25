import { test, expect } from "@playwright/test";

test("standalone PWA upgrades from build A to build B and removes the old shell cache", async ({ page, context }) => {
  await context.addCookies([{ name: "foodprint_e2e_version", value: "build-a", domain: "localhost", path: "/" }]);
  await page.goto("/e2e/photo-upload");
  await expect.poll(async () => page.evaluate(async () => {
    if (!("serviceWorker" in navigator)) return { supported: false, hasRegistration: false, active: "none", installing: "none", waiting: "none" };
    const registration = await navigator.serviceWorker.getRegistration();
    return { supported: true, hasRegistration: Boolean(registration), active: registration?.active?.state ?? "none", installing: registration?.installing?.state ?? "none", waiting: registration?.waiting?.state ?? "none" };
  }), { timeout: 15_000 }).toMatchObject({ hasRegistration: true });
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    return { active: registration?.active?.state ?? "none", installing: registration?.installing?.state ?? "none", waiting: registration?.waiting?.state ?? "none" };
  }), { timeout: 15_000 }).toMatchObject({ active: "activated" });

  const initialCache = await page.evaluate(() => caches.keys());
  expect(initialCache.some((key) => key.includes("build-a"))).toBe(true);

  await context.addCookies([{ name: "foodprint_e2e_version", value: "build-b", domain: "localhost", path: "/" }]);
  await expect.poll(async () => page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration?.update();
    return Boolean(registration?.waiting);
  }), { timeout: 30_000 }).toBe(true);

  await expect(page.getByText("食迹有新版本可用")).toBeVisible();
  const reload = page.waitForEvent("load");
  await page.getByRole("button", { name: "刷新更新" }).click();
  await reload;
  await expect.poll(async () => page.evaluate(() => caches.keys()), { timeout: 30_000 }).toEqual(expect.arrayContaining([expect.stringContaining("build-b")]));
  const finalCache = await page.evaluate(() => caches.keys());
  expect(finalCache.some((key) => key.includes("build-a"))).toBe(false);
  await expect(page.getByTestId("deployment-version")).toContainText("build-b");
});
