const fs = require("node:fs");
const path = require("node:path");
const config = require("../site-config.js");

function publicUrl(value, setting) {
  if (typeof value !== "string" || !/^https:\/\/[^/?#\\\s@]+(?:[/?#]|$)/i.test(value) || /[\\\s\x00-\x1f\x7f]/.test(value)) {
    throw new Error(setting + " must be an absolute HTTPS URL without credentials");
  }
  const url = new URL(value);
  if (url.username || url.password) throw new Error(setting + " contains credentials");
  return url.href;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (char) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]
  ));
}

function replaceRequired(source, pattern, replacement, description) {
  if (!pattern.test(source)) throw new Error("Missing " + description);
  pattern.lastIndex = 0;
  return source.replace(pattern, replacement);
}

function updateLinks(source, marker, url) {
  const elements = new RegExp('<a\\b(?=[^>]*\\s' + marker + '(?=[\\s=>]))[^>]*>', 'gi');
  return replaceRequired(source, elements, (tag) => replaceRequired(
    tag, /\bhref="[^"]*"/i, () => 'href="' + escapeHtml(url) + '"', marker + " href"
  ), marker);
}

function render(source, format, settings) {
  // The two destinations perform different jobs and must never share a fallback.
  const merchant = publicUrl(settings.promotionUrl, "promotionUrl");
  const network = publicUrl(settings.networkUrl, "networkUrl");
  const code = escapeHtml(String(settings.promotionCode || "").trim());
  if (!code) throw new Error("Set promotionCode to the current merchant code");
  let result = source;
  if (format === "html") {
    result = updateLinks(result, "data-promo-link", merchant);
    result = updateLinks(result, "data-network-link", network);
  } else {
    for (const [id, url] of [["prodclub-offer", merchant], ["network-offer", network]]) {
      const definition = new RegExp("^\\[" + id + "\\]:[^\\r\\n]*$", "gm");
      if ([...result.matchAll(definition)].length !== 1) throw new Error("Expected one Markdown definition for " + id);
      result = result.replace(definition, () => "[" + id + "]: " + url);
    }
  }
  return replaceRequired(result, /(<(code|span)\b[^>]*\sdata-promo-code(?=[\s=>])[^>]*>)[^<]*(<\/\2>)/gi,
    (_, open, element, close) => open + code + close, "data-promo-code");
}

function sync(checkOnly) {
  const files = [["index.html", "html"], ["README.md", "markdown"]];
  const changes = files.map(([name, format]) => {
    const file = path.join(__dirname, "..", name);
    const source = fs.readFileSync(file, "utf8");
    const result = render(source, format, config);
    return { file, name, result, changed: result !== source };
  }).filter((item) => item.changed);
  if (checkOnly && changes.length) {
    throw new Error("Run node tools/partner.cjs to synchronize " + changes.map((item) => item.name).join(", "));
  }
  for (const item of changes) fs.writeFileSync(item.file, item.result);
  console.log("README and HTML referral links are synchronized.");
}

module.exports = { render };
if (require.main === module) {
  try {
    const args = process.argv.slice(2);
    if (args.some((arg) => arg !== "--check")) throw new Error("Usage: node tools/partner.cjs [--check]");
    sync(args.includes("--check"));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
