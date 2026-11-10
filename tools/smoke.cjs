// Run after npm ci, with Playwright available via NODE_PATH and a local Chrome.
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const http = require("node:http");
const path = require("node:path");
const { chromium } = require("playwright");
const MarkdownIt = require("markdown-it");
const { render } = require("./partner.cjs");
const config = require("../site-config.js");

const root = path.resolve(__dirname, "..");
const output = path.join(root, ".qa");
const prefix = "/preview/chatgpt-subscription-guide/";
const mime = {
  ".html": "text/html; charset=utf-8", ".js": "application/javascript", ".css": "text/css",
  ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".mp4": "video/mp4", ".vtt": "text/vtt; charset=utf-8",
};

async function serve(req, res) {
  const pathname = new URL(req.url, "http://localhost").pathname;
  if (pathname === "/favicon.ico") return res.writeHead(204).end();
  if (!pathname.startsWith(prefix)) return res.writeHead(404).end();
  const file = path.resolve(root, decodeURIComponent(pathname.slice(prefix.length)) || "index.html");
  if (!file.startsWith(root + path.sep)) return res.writeHead(404).end();
  try {
    const body = await fs.readFile(file);
    const headers = { "Content-Type": mime[path.extname(file)] || "application/octet-stream" };
    if (path.extname(file) === ".mp4" && req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!match) return res.writeHead(416).end();
      const start = Number(match[1]);
      const end = match[2] ? Math.min(Number(match[2]), body.length - 1) : body.length - 1;
      if (start > end) return res.writeHead(416).end();
      headers["Content-Range"] = "bytes " + start + "-" + end + "/" + body.length;
      headers["Content-Length"] = end - start + 1;
      return res.writeHead(206, headers).end(body.subarray(start, end + 1));
    }
    res.writeHead(200, headers).end(body);
  } catch {
    res.writeHead(404).end();
  }
}

async function verifyRender(page) {
  const html = await fs.readFile(path.join(root, "index.html"), "utf8");
  const readme = await fs.readFile(path.join(root, "README.md"), "utf8");
  const md = new MarkdownIt({ html: true });
  const synthetic = {
    promotionUrl: "https://merchant.example/r/new?foo=one&bar=two",
    networkUrl: "https://network.example/join?aff=other&lang=en",
    promotionCode: '<img src=x onerror="alert(1)"> $&',
  };
  const cases = [
    { ...config, promotionUrl: synthetic.promotionUrl },
    { ...config, networkUrl: synthetic.networkUrl },
    synthetic,
  ];
  for (const [source, format] of [[html, "html"], [readme, "markdown"]]) {
    assert.equal(render(source, format, config), source, format + " not synchronized");
    for (const key of ["promotionUrl", "networkUrl"]) {
      for (const bad of ["", "javascript:alert(1)", "http://example.com", "//example.com", "https://user:pass@example.com", "https://example.com/a b"]) {
        assert.throws(() => render(source, format, { ...config, [key]: bad }), key + " accepted " + bad);
      }
    }
    assert.throws(() => render(source, format, { ...config, promotionCode: "" }));
    assert.throws(() => render(source.replaceAll("data-promo-code", "other-code"), format, config));
    if (format === "html") {
      for (const marker of ["data-promo-link", "data-network-link"]) {
        assert.throws(() => render(source.replaceAll(marker, "other-link"), format, config));
      }
    } else {
      for (const id of ["prodclub-offer", "network-offer"]) {
        assert.throws(() => render(source + "\n[" + id + "]: https://example.com\n", format, config));
      }
    }
    for (const settings of cases) {
      const updated = render(source, format, settings);
      assert.equal(render(updated, format, settings), updated, "Re-running synchronization changed content");
      const markup = format === "html" ? updated : md.render(updated);
      // DOMParser uses an inert document; no script or external destination is requested.
      const result = await page.evaluate((input) => {
        const doc = new DOMParser().parseFromString(input, "text/html");
        return {
          links: Array.from(doc.links, (link) => link.getAttribute("href")),
          merchant: Array.from(doc.querySelectorAll("a[data-promo-link]"), (link) => link.getAttribute("href")),
          network: Array.from(doc.querySelectorAll("a[data-network-link]"), (link) => link.getAttribute("href")),
          codes: Array.from(doc.querySelectorAll("[data-promo-code]"), (code) => code.textContent),
          injectedElements: doc.querySelectorAll("[data-promo-code] *").length,
        };
      }, markup);
      assert.ok(result.links.includes(settings.promotionUrl), format + " lost merchant URL");
      assert.ok(result.links.includes(settings.networkUrl), format + " lost network URL");
      if (settings.promotionUrl !== config.promotionUrl) assert.ok(!result.links.includes(config.promotionUrl));
      if (settings.networkUrl !== config.networkUrl) assert.ok(!result.links.includes(config.networkUrl));
      assert.ok(result.codes.length);
      assert.ok(result.codes.every((value) => value === settings.promotionCode));
      assert.equal(result.injectedElements, 0);
      if (format === "html") {
        assert.ok(result.merchant.length && result.merchant.every((url) => url === settings.promotionUrl));
        assert.ok(result.network.length && result.network.every((url) => url === settings.networkUrl));
      }
    }
  }
}

async function verifyDestinations(page) {
  assert.match(await page.locator("h1").innerText(), /ProdClub.+ChatGPT Plus \/ Pro/);
  assert.equal(await page.locator("#entry-link").getAttribute("href"), config.promotionUrl);
  const sponsored = await page.locator("a[rel~=sponsored]").evaluateAll((anchors) => anchors.map((a) => ({
    url: a.getAttribute("href"), merchant: a.hasAttribute("data-promo-link"), network: a.hasAttribute("data-network-link"),
  })));
  assert.ok(sponsored.filter((a) => a.merchant).length >= 4);
  assert.ok(sponsored.some((a) => a.network));
  for (const link of sponsored) {
    assert.notEqual(link.merchant, link.network);
    assert.equal(link.url, link.merchant ? config.promotionUrl : config.networkUrl);
  }
  for (const id of ["guide-plus", "guide-pro", "partner"]) {
    assert.equal(await page.locator("#" + id + " a[data-promo-link]").getAttribute("href"), config.promotionUrl);
  }
  assert.equal(await page.locator("#faq details").count(), 15);
  const codes = await page.locator("[data-promo-code]").allTextContents();
  assert.ok(codes.length >= 2 && codes.every((text) => text === config.promotionCode));
}

async function verifyLayout(page, width, height, name) {
  await page.setViewportSize({ width, height });
  await page.evaluate(() => scrollTo(0, 0));
  const dims = await page.evaluate(() => ({
    width: document.documentElement.clientWidth, content: document.documentElement.scrollWidth,
    entry: document.querySelector("#entry-link").getBoundingClientRect().toJSON(),
  }));
  assert.ok(dims.content <= dims.width + 1, width + "px layout overflows");
  assert.ok(dims.entry.y < height && dims.entry.width > 0 && dims.entry.bottom <= height, width + "px first-screen CTA");
  if (name) {
    await page.screenshot({ path: path.join(output, name + ".png") });
    await page.screenshot({ path: path.join(output, name + "-full.png"), fullPage: true });
  }
}

async function verifyMedia(page) {
  const screenshots = page.locator("#steps figure img");
  assert.equal(await screenshots.count(), 2);
  for (const image of await screenshots.all()) {
    await image.scrollIntoViewIfNeeded();
    await image.evaluate((img) => img.decode());
    assert.ok(await image.evaluate((img) => img.naturalWidth > 0 && img.naturalHeight > 0 && img.closest("a")?.href === img.src));
  }
  const video = page.locator("#steps video");
  const before = await video.evaluate((v) => ({ playing: !v.paused, auto: v.autoplay, controls: v.controls, preload: v.preload }));
  assert.deepEqual(before, { playing: false, auto: false, controls: true, preload: "none" });
  await video.evaluate(async (v) => {
    v.muted = true;
    v.playbackRate = 12;
    await v.play();
  });
  await page.waitForFunction(() => document.querySelector("video").ended, undefined, { timeout: 20000 });
  const playback = await video.evaluate((v) => ({
    duration: v.duration, decodedWidth: v.videoWidth, decodedHeight: v.videoHeight, current: v.currentTime,
    track: v.textTracks[0]?.language, cues: v.textTracks[0]?.cues?.length ?? 0, error: v.error?.message,
  }));
  assert.ok(playback.duration > 0 && Math.abs(playback.duration - playback.current) < .5);
  assert.ok(playback.decodedWidth > 0 && playback.decodedHeight > 0 && !playback.error);
  assert.ok(playback.track?.startsWith("zh") && playback.cues >= 1);
  await video.evaluate((v) => { v.load(); }); // Restore the cover for layout screenshots.
}

async function verifyInteractions(page, base) {
  await page.goto(base);
  await verifyDestinations(page);
  for (const id of ["guide-plus", "guide-pro", "partner"]) {
    await page.goto(base + "#" + id);
    assert.ok(await page.locator("#" + id).evaluate((el) => Math.abs(el.getBoundingClientRect().top) < innerHeight));
    const link = page.locator("#" + id + " a[data-promo-link]");
    await link.click();
    assert.equal(page.url(), config.promotionUrl);
  }
  await page.goto(base);
  await page.locator("a[data-network-link]").first().click();
  assert.equal(page.url(), config.networkUrl);
  await page.goto(base);
  const question = page.locator("#faq details").first();
  await question.locator("summary").focus();
  await page.keyboard.press("Enter");
  assert.ok(await question.evaluate((item) => item.open));
  await page.keyboard.press("Space");
  assert.ok(!await question.evaluate((item) => item.open));
  await page.evaluate(() => Object.defineProperty(navigator, "clipboard", {
    configurable: true, value: { writeText: async (text) => { document.documentElement.dataset.copied = text; } },
  }));
  await page.locator("#copy-code").click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.copied), config.promotionCode);
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", { value: undefined });
    document.execCommand = () => false;
  });
  await page.locator("#copy-code").click();
  assert.equal(await page.evaluate(() => getSelection().toString()), config.promotionCode);
  assert.match(await page.locator("#copy-status").innerText(), /手动复制/);
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const server = http.createServer(serve);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = "http://127.0.0.1:" + server.address().port;
  const base = origin + prefix;
  let browser;
  try {
    browser = await chromium.launch({ channel: "chrome", headless: true });
    const errors = [];
    async function localContext(options) {
      const context = await browser.newContext({ reducedMotion: "reduce", ...options });
      // Fulfil external clicks in memory so no merchant, register or payment endpoint is contacted.
      await context.route("**/*", (route) => {
        const url = route.request().url();
        if (new URL(url).origin === origin) return route.continue();
        if (url === config.promotionUrl || url === config.networkUrl) {
          return route.fulfill({ contentType: "text/html", body: "<title>Offline link target</title>" });
        }
        errors.push("Unexpected external request: " + url);
        return route.abort();
      });
      return context;
    }
    const context = await localContext({});
    const page = await context.newPage();
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => { if (message.type() === "error") errors.push(message.text()); });
    page.on("response", (response) => { if (response.status() >= 400) errors.push(response.status() + " " + response.url()); });
    await verifyRender(page);
    await verifyInteractions(page, base);
    await page.goto(base);
    await verifyMedia(page);
    await verifyLayout(page, 1440, 930, "desktop");
    await verifyLayout(page, 390, 844, "mobile");
    await verifyLayout(page, 320, 740);
    await context.close();

    const plain = await localContext({ javaScriptEnabled: false });
    const staticPage = await plain.newPage();
    await staticPage.goto(base + "#partner");
    await verifyDestinations(staticPage);
    assert.ok(await staticPage.locator("#copy-code").isHidden());
    await staticPage.locator("#entry-link").click();
    assert.equal(staticPage.url(), config.promotionUrl);
    await plain.close();
    assert.deepEqual(errors, []);
    console.log("PASS: synchronized HTML/README, separate referral settings, safe markers, offline destinations, mobile/desktop CTA, 15 FAQs, clipboard, images, full captioned playback, no-JS links.");
  } finally {
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
