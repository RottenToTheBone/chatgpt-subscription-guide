const fs = require("node:fs");
const path = require("node:path");
const config = require("../site-config.js");

const root = path.resolve(__dirname, "..");
const official = "https://chatgpt.com/pricing";
const start = "<!-- partner:start -->";
const end = "<!-- partner:end -->";

function safeUrl(value) {
  if (typeof value !== "string") return null;
  const raw = value.trim();
  if (!/^https:\/\/[^/?#\\\s@]+(?:[/?#]|$)/i.test(raw) || /[\\\s\x00-\x1f\x7f]/.test(raw)) return null;
  try {
    const url = new URL(raw);
    return url.hostname && !url.username && !url.password ? url : null;
  } catch {
    return null;
  }
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function partnerSnippet(settings, format) {
  const url = safeUrl(settings.promotionUrl);
  if (!url) {
    const label = "当前没有第三方推广入口。可到 ChatGPT 官方套餐页查看可用方案。";
    return format === "markdown"
      ? label + " [查看官方套餐](" + official + ")"
      : '<p>' + label + '</p>\n<p><a id="partner-link" class="partner-entry" href="' + official + '">查看官方套餐 ↗</a></p>';
  }

  const href = escapeHtml(url.href);
  const merchant = url.hostname === "prodclub.ai" ? "ProdClub" : escapeHtml(url.host);
  const code = typeof settings.promotionCode === "string" ? escapeHtml(settings.promotionCode.trim()) : "";
  const disclosure = merchant + " 是提供报价和售后的第三方商户。通过以下推广链接下单，本站可能获得佣金或推广奖励。价格、适用套餐与退款条件以商户下单页为准。";
  const link = '<a href="' + href + '" rel="sponsored noopener noreferrer">' + href + '</a>';

  if (format === "markdown") {
    return disclosure + "\n\n推广入口 " + link + (code ? "\n\n推广码 <code>" + code + "</code>" : "");
  }
  const section = [
    '<p>' + disclosure + '</p>',
    '<p class="merchant-url"><a id="partner-link" class="partner-entry" href="' + href + '" rel="sponsored noopener noreferrer">' + href + '</a> <span aria-hidden="true">↗</span></p>',
  ];
  if (code) {
    section.push(
      '<div class="promo-box" id="promo-box">',
      '  <span>推广码 <strong id="promo-code">' + code + '</strong></span>',
      '  <button id="copy-code" type="button" hidden>复制推广码</button><span id="copy-status" role="status"></span>',
      '</div>',
    );
  }
  return section.join("\n");
}

function replaceSnippet(source, snippet) {
  const first = source.indexOf(start);
  const last = source.indexOf(end);
  if (first < 0 || last < first || first !== source.lastIndexOf(start) || last !== source.lastIndexOf(end)) {
    throw new Error("Expected one ordered pair of partner:start and partner:end markers.");
  }
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return source.slice(0, first + start.length) + newline + snippet.replace(/\r?\n/g, newline)
    + newline + source.slice(last);
}

function sync(checkOnly) {
  const files = [["index.html", "html"], ["README.md", "markdown"]];
  // Validate all markers before editing either document.
  const changes = files.map(([file, format]) => {
    const filename = path.join(root, file);
    const source = fs.readFileSync(filename, "utf8");
    const result = replaceSnippet(source, partnerSnippet(config, format));
    return { file, filename, result, changed: result !== source };
  }).filter((entry) => entry.changed);
  if (checkOnly && changes.length) {
    throw new Error("Out-of-date partner information in " + changes.map((entry) => entry.file).join(", ") + ". Run node tools/partner.cjs.");
  }
  for (const { filename, result } of changes) fs.writeFileSync(filename, result);
  console.log(checkOnly ? "Partner information matches site-config.js." : "Partner information synchronized.");
}

module.exports = { safeUrl, partnerSnippet, replaceSnippet };

if (require.main === module) {
  try {
    if (process.argv.slice(2).some((arg) => arg !== "--check")) throw new Error("Usage: node tools/partner.cjs [--check]");
    sync(process.argv.includes("--check"));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
