const fs = require("node:fs");
const path = require("node:path");
const MarkdownIt = require("markdown-it");

const root = fs.realpathSync(path.resolve(__dirname, ".."));
const output = path.join(root, "dist");
const base = "https://rottentothebone.github.io/chatgpt-subscription-guide/";
const slugs = ["compare-plans", "payment-and-renewal", "prodclub-referral"];
const assets = [
  "article.css", "favicon.svg", "social-preview.png", "tutorial-overview.webp", "tutorial-offer.webp",
  "prodclub-walkthrough.mp4", "walkthrough-zh.vtt",
];
const publicFiles = ["index.html", "app.js", "styles.css", ...assets.map((name) => "assets/" + name)];
const md = new MarkdownIt({ html: false });
const escape = md.utils.escapeHtml;

md.renderer.rules.link_open = (tokens, index, options, env, renderer) => {
  const token = tokens[index];
  const href = token.attrGet("href");
  const localArticle = /^(?:\.\/)?([\w-]+)\.md([?#].*)?$/.exec(href);
  if (localArticle) {
    const [, slug, suffix = ""] = localArticle;
    if (!slugs.includes(slug)) throw new Error("Unknown guide link: " + href);
    token.attrSet("href", slug + ".html" + suffix);
  }
  return renderer.renderToken(tokens, index, options);
};
md.renderer.rules.table_open = () => '<div class="table-scroll" role="region" aria-label="对照表，可横向滚动" tabindex="0"><table>\n';
md.renderer.rules.table_close = () => "</table></div>\n";

function readSource(relativePath) {
  const source = path.join(root, relativePath);
  if (fs.realpathSync(source) !== source || !fs.statSync(source).isFile()) {
    throw new Error("Expected a regular project file: " + relativePath);
  }
  return fs.readFileSync(source);
}

function plainText(inline) {
  return inline.children.map((token) => token.content).join("").trim();
}

function loadArticle(slug) {
  const source = readSource("guides/" + slug + ".md").toString("utf8");
  const env = {};
  const tokens = md.parse(source, env);
  if (tokens[0]?.type !== "heading_open" || tokens[0].tag !== "h1" || tokens[0].map[0] !== 0) {
    throw new Error("Expected an H1 on the first line: " + slug);
  }
  const title = plainText(tokens[1]);
  const paragraph = tokens.findIndex((token) => token.type === "paragraph_open");
  if (paragraph < 0) throw new Error("Expected an introduction: " + slug);
  const introduction = plainText(tokens[paragraph + 1]);
  const sentences = introduction.match(/[^。！？]+[。！？]?/gu) || [introduction];
  let description = sentences[0];
  if (description.length < 48 && sentences[1]) description += sentences[1];
  if (description.length > 130) description = description.slice(0, 129) + "…";
  const content = md.renderer.render(tokens.slice(3), md.options, env);
  return { slug, title, description, content };
}

function renderArticle(article, articles) {
  const { slug, title, description, content } = article;
  const url = new URL("guides/" + slug + ".html", base).href;
  const metadata = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: title,
    description,
    inLanguage: "zh-CN",
    mainEntityOfPage: url,
    author: { "@type": "Person", name: "RottenToTheBone", url: "https://github.com/RottenToTheBone" },
  };
  const related = articles.filter((other) => other.slug !== slug).map((other) =>
    `<li><a href="${other.slug}.html">${escape(other.title)} <span aria-hidden="true">→</span></a></li>`).join("\n");
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(title)} · ProdClub 开通指南</title>
  <meta name="description" content="${escape(description)}">
  <link rel="canonical" href="${url}">
  <meta property="og:type" content="article">
  <meta property="og:site_name" content="ProdClub 开通指南">
  <meta property="og:locale" content="zh_CN">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${url}">
  <meta property="og:image" content="${base}assets/social-preview.png">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="ProdClub 的 ChatGPT Plus 与 Pro 订阅开通教程">
  <link rel="icon" href="../assets/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="../assets/article.css">
  <script type="application/ld+json">${JSON.stringify(metadata).replace(/</g, "\\u003c")}</script>
</head>
<body class="article-page">
  <a class="skip" href="#article">跳到正文</a>
  <header class="article-header-row"><a href="../index.html">← ProdClub 开通指南</a></header>
  <main class="article-wrap" id="article" tabindex="-1">
    <article><h1>${escape(title)}</h1>${content}</article>
    <nav class="related-guides" aria-label="继续阅读"><h2>继续阅读</h2><ul>${related}</ul></nav>
  </main>
</body>
</html>
`;
}

const articles = slugs.map(loadArticle);
const files = new Map(publicFiles.map((name) => [name, readSource(name)]));
const urls = [base];
for (const article of articles) {
  const name = "guides/" + article.slug + ".html";
  files.set(name, renderArticle(article, articles));
  urls.push(new URL(name, base).href);
}
files.set("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url><loc>${escape(url)}</loc></url>`).join("\n")}
</urlset>
`);
files.set(".nojekyll", "");

// Collect and render all inputs before replacing the generated directory.
if (fs.existsSync(output)) {
  if (fs.realpathSync(output) !== output || !fs.lstatSync(output).isDirectory()) {
    throw new Error("Refusing to replace a non-directory or redirected dist path");
  }
  fs.rmSync(output, { recursive: true });
}
for (const [name, body] of files) {
  const destination = path.join(output, name);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, body);
}
console.log(`Built ${files.size} public files including ${articles.length} guides in dist/`);
