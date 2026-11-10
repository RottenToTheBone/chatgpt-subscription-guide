// Run with Node 20+, Playwright (available via NODE_PATH), and an installed Chrome.
// Local screenshots are written under .qa/. The delivered site configuration is never edited.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { pathToFileURL } = require("node:url");
const { safeUrl, partnerSnippet, replaceSnippet } = require("./partner.cjs");
const config = require("../site-config.js");
const { chromium } = require("playwright");

const configuredUrl = safeUrl(config.promotionUrl);
const root = path.resolve(__dirname, "..");
const output = path.join(root, ".qa");
const prefix = "/preview/planport/";
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".png": "image/png",
};

async function serve(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/favicon.ico") {
    res.writeHead(204).end();
    return;
  }
  if (!pathname.startsWith(prefix)) {
    res.writeHead(404).end();
    return;
  }
  const relativePath = decodeURIComponent(pathname.slice(prefix.length)) || "index.html";
  const file = path.resolve(root, relativePath);
  if (!file.startsWith(root + path.sep)) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await fs.readFile(file);
    res.writeHead(200, { "Content-Type": mimeTypes[path.extname(file)] || "application/octet-stream" }).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

async function assertPlan(page, name) {
  const lower = name.toLowerCase();
  assert.equal(await page.locator("#guide-plan").innerText(), name);
  assert.equal(await page.locator(`[data-plan-option="${lower}"]`).getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator('[data-plan-option][aria-pressed="true"]').count(), 1);
}

async function checkLayout(page, width, height, screenshotName) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => document.fonts.ready);
  const dimensions = await page.evaluate(() => ({
    visible: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
    images: Array.from(document.images, (image) => image.complete && image.naturalWidth > 0),
  }));
  assert.ok(dimensions.content <= dimensions.visible + 1, `Horizontal overflow at ${width}px (${dimensions.content}px)`);
  assert.ok(dimensions.images.every(Boolean), `Unloaded image at ${width}px`);
  if (screenshotName) {
    await page.screenshot({ path: path.join(output, screenshotName + ".png"), animations: "disabled" });
    await page.screenshot({ path: path.join(output, screenshotName + "-full.png"), fullPage: true, animations: "disabled" });
  }
}

async function exercise(page, context, base) {
  const official = "https://chatgpt.com/";
  const fileUrl = pathToFileURL(path.join(root, "index.html")).href;
  await page.goto(fileUrl + "#guide-pro");
  await assertPlan(page, "Pro");
  assert.equal(new URL(await page.locator("#guide-entry").getAttribute("href")).protocol, "https:");
  assert.equal(await page.locator("#partner-link").getAttribute("href"), configuredUrl?.href || official + "pricing");

  await page.goto(base);
  await assertPlan(page, "Plus");
  assert.equal(await page.locator("#entry-link").getAttribute("href"), official + "pricing");
  assert.equal(await page.locator("#guide-entry").getAttribute("href"), official + "explore/plus");
  assert.equal(await page.locator("a[rel~=sponsored]:not(#partner a)").count(), 0);
  const articles = await page.locator("#library a").evaluateAll((anchors) => anchors.map((link) => link.getAttribute("href")));
  assert.deepEqual(articles, ["guides/compare-plans.html", "guides/payment-and-renewal.html", "guides/prodclub-referral.html"]);
  await checkLayout(page, 1440, 930, "desktop");
  await checkLayout(page, 390, 844, "mobile");
  await checkLayout(page, 320, 740);

  // A visitor can scroll to the guide before ever following an anchor.
  await page.locator('[data-plan-option="pro"]').click();
  assert.equal(new URL(page.url()).hash, "#guide-pro");
  await page.reload();
  await assertPlan(page, "Pro");
  await page.goto(base);
  const proCard = page.locator('[data-choose-plan="pro"]');
  assert.equal(await proCard.getAttribute("href"), "#guide-pro");
  await proCard.click();
  await assertPlan(page, "Pro");
  assert.equal(new URL(page.url()).hash, "#guide-pro");
  await page.waitForFunction(() => document.activeElement === document.querySelector("#guide h2"));
  assert.equal(await page.locator("#guide-entry").getAttribute("href"), official + "explore/pro");
  await page.reload();
  await assertPlan(page, "Pro");
  const plusButton = page.locator('[data-plan-option="plus"]');
  await plusButton.focus();
  await page.keyboard.press("Space");
  await assertPlan(page, "Plus");
  await page.goto(base + "#guide-pro");
  await assertPlan(page, "Pro");
  const question = page.locator("details").first();
  const isOpen = await question.evaluate((details) => details.open);
  await question.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.equal(await question.evaluate((details) => details.open), !isOpen);

  const template = await fs.readFile(path.join(root, "index.html"), "utf8");
  const promotionUrl = "https://partner.example/r/qa?ref=guide&src=test";
  let testConfig = { promotionUrl, promotionCode: "QA-ONLY" };
  // Simulate the actual static output from the synchronizer, leaving the checkout intact.
  await context.route(base, (route) => route.fulfill({
    contentType: "text/html; charset=utf-8",
    body: replaceSnippet(template, partnerSnippet(testConfig, "html")),
  }));
  await page.goto(base);
  assert.equal(await page.locator("#guide-entry").getAttribute("href"), official + "explore/plus");
  assert.equal(await page.locator("#entry-link").getAttribute("href"), official + "pricing");
  assert.match(await page.locator("#partner").innerText(), /partner\.example/);
  assert.equal(await page.locator("#partner-link").getAttribute("href"), promotionUrl);
  assert.match(await page.locator("#partner-link").getAttribute("rel"), /sponsored/);
  assert.equal(await page.locator("#promo-code").innerText(), testConfig.promotionCode);
  await page.evaluate(() => {
    let value;
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async (text) => { value = text; }, readText: async () => value },
    });
  });
  await page.locator("#copy-code").click();
  assert.equal(await page.evaluate(() => navigator.clipboard.readText()), testConfig.promotionCode);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined });
    document.execCommand = () => false;
  });
  await page.locator("#copy-code").click();
  assert.equal(await page.evaluate(() => getSelection().toString()), testConfig.promotionCode);
  assert.match(await page.locator("#copy-status").innerText(), /手动复制/);

  testConfig = { promotionUrl, promotionCode: "" };
  await page.reload();
  assert.equal(await page.locator("#partner-link").getAttribute("href"), promotionUrl);
  assert.equal(await page.locator("#promo-box").count(), 0);

  for (const badUrl of ["", "javascript:alert(1)", "//partner.example", "http://partner.example", "https://user:pass@partner.example", "https:////example.com", "https://partner.example/a b"]) {
    testConfig = { promotionUrl: badUrl, promotionCode: "unused" };
    await page.reload();
    assert.equal(await page.locator("#partner-link").getAttribute("href"), official + "pricing");
    assert.equal(await page.locator("#entry-link").getAttribute("href"), official + "pricing");
    assert.equal(await page.locator("#guide-entry").getAttribute("href"), official + "explore/plus");
    assert.equal(await page.locator("a[rel~=sponsored], #promo-box").count(), 0);
  }
  testConfig = { promotionUrl, promotionCode: '<img src=x onerror="alert(1)">' };
  await page.reload();
  assert.equal(await page.locator("#promo-code img").count(), 0);
  assert.equal(await page.locator("#promo-code").innerText(), testConfig.promotionCode);

}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const server = http.createServer(serve);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    page.setDefaultTimeout(5000);
    const errors = [];
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("response", (response) => {
      if (response.status() >= 400) errors.push(response.status() + " " + response.url());
    });
    const base = `http://127.0.0.1:${server.address().port}${prefix}`;
    await exercise(page, context, base);
    const staticContext = await browser.newContext({ javaScriptEnabled: false });
    const staticPage = await staticContext.newPage();
    await staticPage.goto(base);
    assert.equal(await staticPage.locator("#library a[href]").count(), 3);
    assert.equal(await staticPage.locator("#partner-link").getAttribute("href"), configuredUrl?.href || "https://chatgpt.com/pricing");
    if (configuredUrl && typeof config.promotionCode === "string" && config.promotionCode.trim()) {
      assert.equal(await staticPage.locator("#promo-code").innerText(), config.promotionCode.trim());
      assert.ok(await staticPage.locator("#copy-code").isHidden());
    }
    assert.equal(await staticPage.locator("#entry-link").getAttribute("href"), "https://chatgpt.com/pricing");
    await staticContext.close();
    assert.deepEqual(errors, [], "Console and network errors");
    console.log("PASS — desktop and mobile layout, plan navigation, keyboard, FAQ, file and nested hosting, partner config, clipboard, static partner disclosure and no-JS fallback");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
