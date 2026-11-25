/** Every diagram's own page, and a gallery of them all: self-contained HTML (styles, data and
 *  script inline) in mndflow's look, dark unless the reader chose otherwise, with mndsite's
 *  three-way theme toggle sharing its stored choice. With `?embed` a page is the diagram alone,
 *  for a frame in a host page, following that page's theme. */

import { readFileSync } from "node:fs";
import type { Config } from "./config.js";
import { DECK_CSS } from "./deck-style.js";
import type { Diagram, Drawing } from "./diagrams.js";
import { href, published } from "./links.js";
import { theme } from "./render/theme.js";
import { esc } from "./render/text.js";


/** The page script, bundled beside this module. */
const RUNTIME = readFileSync(new URL("./runtime.js", import.meta.url), "utf8");

/** Sets the theme before the first paint: the stored choice, else dark; in a frame, the host's. */
const BOOT = `(function(){var d=document.documentElement,e=new URLSearchParams(location.search).has("embed"),t,k;
try{t=localStorage.getItem("theme")}catch(x){}
k=t==="light"?0:t==="system"?!matchMedia("(prefers-color-scheme: light)").matches:1;
if(e){d.classList.add("mm-embedded");try{var p=parent.document.documentElement;
if(p.classList.contains("dark"))k=1;else if(p.classList.contains("light"))k=0}catch(x){}}
d.classList.toggle("dark",!!k);d.classList.toggle("light",!k)})()`.replace(/\n/g, "");

/** The page's own layout, read from the same colours as the drawings. */
const CSS = `
html.mm{background:var(--mm-ground);color:var(--mm-ink);font:13px/1.6 var(--mm-font)}
body{margin:0}
a{color:var(--mm-accent);text-decoration:none}a:hover{text-decoration:underline}
.mm-bar{position:sticky;top:0;z-index:2;display:flex;align-items:center;gap:14px;padding:10px 24px;
border-bottom:1px solid var(--mm-line);background:var(--mm-ground)}
.mm-brand{font-weight:700;letter-spacing:.06em}
.mm-path{color:var(--mm-dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.mm-grow{flex:1}
.mm-icon-button{display:grid;place-items:center;width:32px;height:32px;border:0;border-radius:50%;
background:none;color:var(--mm-dim);cursor:pointer}
.mm-icon-button:hover{background:var(--mm-raised);color:var(--mm-ink)}
.mm-icon-button:focus-visible{outline:2px solid var(--mm-accent)}
main{max-width:1240px;margin:0 auto;padding:28px 24px 72px}
.mm-eyebrow{color:var(--mm-dim);font-size:11px;letter-spacing:.14em;text-transform:uppercase}
h1{margin:6px 0 4px;font-size:22px;letter-spacing:.01em}
h2{margin:40px 0 10px;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--mm-dim)}
.mm-sub{margin:0;color:var(--mm-dim)}
.mm-tools{display:flex;align-items:center;gap:10px;margin:22px 0 8px;min-height:30px}
.mm-trail{flex:1;display:flex;flex-wrap:wrap;gap:6px;color:var(--mm-dim)}
.mm-trail button{all:unset;cursor:pointer;color:var(--mm-accent)}
.mm-trail button:hover{text-decoration:underline}
.mm-trail strong{color:var(--mm-ink)}
.mm-field{width:15rem;padding:5px 9px;border:1px solid var(--mm-line);border-radius:4px;
background:var(--mm-fill);color:var(--mm-ink);font:inherit}
.mm-field:focus{outline:none;border-color:var(--mm-accent)}
.mm-chip-button{padding:4px 10px;border:1px solid var(--mm-line);border-radius:4px;background:none;
color:var(--mm-dim);font:inherit;cursor:pointer}
.mm-chip-button:hover,.mm-chip-button[aria-pressed=true]{border-color:var(--mm-accent);color:var(--mm-ink)}
.mm-stage svg{display:block;max-width:100%;height:auto;margin:0 auto}
.mm-stage.mm-actual{overflow:auto}.mm-stage.mm-actual svg{max-width:none}
table{width:100%;border-collapse:collapse}
th{padding:6px 10px;text-align:left;font-weight:400;font-size:11px;letter-spacing:.1em;text-transform:uppercase;
color:var(--mm-dim);border-bottom:1px solid var(--mm-line)}
td{padding:7px 10px;border-bottom:1px solid var(--mm-raised);vertical-align:top}
.mm-status{display:inline-block;padding:0 7px;border:1px solid var(--mm-line);border-radius:3px;font-size:11px;color:var(--mm-dim)}
.mm-status.mm-bad{border-color:var(--mm-warn);color:var(--mm-warn)}
pre{margin:0;padding:14px 16px;overflow:auto;border:1px solid var(--mm-line);border-radius:4px;
background:var(--mm-fill);font:12px/1.6 var(--mm-font)}
.mm-card-tip{position:fixed;z-index:3;max-width:340px;padding:10px 12px;border:1px solid var(--mm-line);
border-radius:4px;background:var(--mm-fill);box-shadow:0 8px 24px rgb(0 0 0/.35);pointer-events:none}
.mm-card-tip b{display:block}.mm-card-tip p{margin:4px 0 0;color:var(--mm-dim)}
.mm-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;margin-top:24px}
.mm-tile{display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--mm-line);border-radius:4px;
background:var(--mm-fill);color:inherit}
.mm-tile:hover{border-color:var(--mm-accent);text-decoration:none}
.mm-thumb{display:grid;place-items:center;height:180px;overflow:hidden;pointer-events:none}
.mm-thumb svg{max-width:100%;max-height:180px;height:auto}
.mm-meta{display:flex;flex-wrap:wrap;gap:6px;color:var(--mm-dim)}
html.mm-embedded,html.mm-embedded body{background:transparent}
html.mm-embedded .mm-bar,html.mm-embedded .mm-head,html.mm-embedded .mm-detail{display:none}
html.mm-embedded main{max-width:none;padding:0}
html.mm-embedded .mm-tools{margin:0 0 6px}`.replace(/\n/g, "");

/** A diagram's own page: its drawing, then what it links to and the source it was drawn from. */
export function page(d: Diagram, config: Config): string {
  const at = `/${config.assets}/${d.id}.html`;
  if (d.deck) return deck(d, config, at);
  const drawing = d.draw(at);
  const source = href(at, published(d.page.url, config.urls), config.urls);
  const data = d.map ? { kind: "map", ...d.map, width: drawing.width, height: drawing.height,
    hrefs: drawing.hrefs, current: d.page.url } : { kind: "flow" };
  const tools = d.kind === "map"
    ? '<div class="mm-tools"><nav class="mm-trail"></nav><input class="mm-field" type="search" placeholder="Find a page…" aria-label="Find a page"></div>'
    : '<div class="mm-tools mm-detail"><span class="mm-grow"></span><button class="mm-chip-button" data-actual aria-pressed="false">Actual size</button></div>';
  const body = `<div class="mm-head"><div class="mm-eyebrow">${d.kind === "map" ? "Site map" : "Flow"} · ${esc(d.page.path)}</div>`
    + `<h1>${esc(d.title)}</h1><p class="mm-sub">Drawn on <a href="${source}">${esc(d.page.title)}</a></p></div>`
    + tools + `<div class="mm-stage" data-kind="${d.kind}">${drawing.svg}</div>`
    + `<div class="mm-detail">${table(d, at, config)}<h2>Source</h2><pre>${esc(d.fence.body)}</pre></div>`;
  return shell(`${d.title} · mndmap`, config, `<a href="index.html">gallery</a>`, body, data);
}

/** A deck's page: the stage the cards are drawn on (holding the still poster until the script
 *  runs) and the narration panel. Framed, it offers to open itself whole. */
function deck(d: Diagram, config: Config, at: string): string {
  const source = href(at, published(d.page.url, config.urls), config.urls);
  const body = `<div class="mm-deck"><div class="mm-viewport"><div class="mm-world">${d.draw(at).svg}</div>`
    + `<a class="mm-open" href="${d.id}.html">Open ⤢</a>`
    + `<div class="mm-hint">← → step · Esc out · click a card</div></div><aside class="mm-panel" aria-live="polite"></aside></div>`;
  const nav = `<a href="index.html">gallery</a> · <a href="${source}">read the page</a>`;
  return shell(`${d.title} · mndmap`, config, nav, body, { kind: "deck", deck: d.deck!.read(at) }, "mm-deck-page");
}

/** The gallery: every diagram as a thumbnail, with where it lives and how its links stand. */
export function gallery(found: Diagram[], config: Config, site: string): string {
  const tiles = found.map((d) => {
    const broken = d.links.filter((l) => l.link.kind === "broken").length;
    const links = d.map ? `${d.map.data.pages.length} pages`
      : d.deck ? `${d.deck.read("/").order.length} cards` : `${d.links.length} links`;
    return `<a class="mm-tile" href="${d.id}.html"><div class="mm-thumb">${d.draw(`/${config.assets}/${d.id}.html`).svg}</div>`
      + `<b>${esc(d.title)}</b><div class="mm-meta"><span class="mm-status">${d.kind}</span>`
      + `<span class="mm-status">${d.mode}</span><span class="mm-status">${links}</span>`
      + (broken ? `<span class="mm-status mm-bad">${broken} broken</span>` : "")
      + `<span>${esc(d.page.path)}</span></div></a>`;
  }).join("");
  const body = `<div class="mm-head"><div class="mm-eyebrow">Gallery</div><h1>${esc(site)}</h1>`
    + `<p class="mm-sub">${found.length} diagram${found.length === 1 ? "" : "s"}, drawn from the site's markdown</p></div>`
    + `<div class="mm-grid">${tiles}</div>`;
  return shell(`${site} diagrams · mndmap`, config, "", body, { kind: "gallery" });
}

/** A flow's links, each with where it goes or why it goes nowhere; a map's folder and page count. */
function table(d: Diagram, at: string, config: Config): string {
  if (d.kind === "map") {
    const pages = d.map!.data.pages.filter((p) => p.url.startsWith(d.map!.root));
    return `<h2>Pages</h2><table><tr><th>Page</th><th>Path</th><th>Words</th></tr>${pages
      .sort((a, b) => a.url.localeCompare(b.url))
      .map((p) => `<tr><td><a href="${href(at, published(p.url, config.urls), config.urls)}">${esc(p.title)}</a></td>`
        + `<td>${esc(p.url)}</td><td>${p.words}</td></tr>`).join("")}</table>`;
  }
  if (!d.links.length) return "<h2>Links</h2><p class=\"mm-sub\">No node links to a page. Add <code>click Node \"page/path\"</code> lines to link them.</p>";
  const rows = d.links.map(({ node, link }) => {
    const target = link.kind === "broken" ? `<span class="mm-status mm-bad">broken</span> ${esc(link.reason)}`
      : link.kind === "external" ? `<a href="${esc(link.ref)}">${esc(link.ref)}</a>`
        : `<a href="${esc(href(at, published(link.page.url, config.urls), config.urls) + (link.hash ? `#${link.hash}` : ""))}">`
          + `${esc(link.page.title)}${link.hash ? ` › ${esc(link.page.sections.find((s) => s.id === link.hash)?.name ?? link.hash)}` : ""}</a>`;
    return `<tr><td>${esc(node)}</td><td>${esc(link.ref)}</td><td>${target}</td></tr>`;
  });
  return `<h2>Links</h2><table><tr><th>Node</th><th>Reference</th><th>Goes to</th></tr>${rows.join("")}</table>`;
}

/** The page around a body: head, bar with the theme toggle, the data and script. */
function shell(title: string, config: Config, nav: string, body: string, data: object, kind = ""): string {
  const json = JSON.stringify(data).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="en" class="mm dark ${kind}"><head><meta charset="utf-8">`
    + `<meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>`
    + `<link rel="icon" href="data:,">`
    + `<script>${BOOT}</script><style>${theme(config.dark)}${CSS}${kind ? DECK_CSS : ""}</style></head><body>`
    + `<header class="mm-bar"><span class="mm-brand">mndmap</span><span class="mm-path">${nav}</span>`
    + `<span class="mm-grow"></span><button class="mm-icon-button" data-theme-toggle aria-label="Theme">`
    + `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"`
    + ` stroke-linecap="round" stroke-linejoin="round"></svg></button></header>`
    + `<main>${body}</main><script type="application/json" id="mm-data">${json}</script>`
    + `<script>${RUNTIME}</script></body></html>`;
}

/** The drawing inline in its page, its styles with it. */
export function inline(drawing: Drawing, config: Config): string {
  return drawing.svg.replace(/^(<svg[^>]*>)/, `$1<style>${theme(config.dark)}</style>`);
}
