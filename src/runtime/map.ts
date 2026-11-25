/** The site map on its own page: laid out at the page's width, folders zoomed into by their
 *  titles and left by the trail, pages found by typing, and a hover card saying what each is. */

import { trail, treemap, type MapData, type MapPage } from "../render/treemap.js";
import { esc } from "../render/text.js";


/** What the build hands the page: the site, where the map starts, its size and its hrefs. */
export type MapState = {
  data: MapData; root: string; width: number; height: number; current: string;
  hrefs: Record<string, string>;
};


/** Draw the map into `stage`, and keep it drawn as the page resizes. */
export function map(stage: HTMLElement, state: MapState) {
  const pages = new Map(state.data.pages.map((p) => [p.url, p]));
  const nav = document.querySelector<HTMLElement>(".mm-trail")!;
  const field = document.querySelector<HTMLInputElement>(".mm-field")!;
  const tip = document.body.appendChild(document.createElement("div"));
  tip.className = "mm-card-tip";
  tip.hidden = true;
  let root = state.root;

  const draw = () => {
    const w = stage.clientWidth;
    const room = innerHeight - stage.getBoundingClientRect().top - 16;
    const framed = document.documentElement.classList.contains("mm-embedded");
    // Framed, fill the frame; on a narrow screen, stand taller than wide; else keep the laid shape
    const shape = w < 600 ? 1.5 : state.height / state.width;
    const h = Math.round(framed ? Math.max(240, room) : Math.max(420, Math.min(w * shape, Math.max(room, 420))));
    stage.innerHTML = treemap(state.data, {
      root, w, h, current: state.current, zoom: true,
      href: (url, hash) => `${state.hrefs[url] ?? url}${hash ? `#${hash}` : ""}`,
    });
    const steps = trail(state.data, root);
    nav.innerHTML = steps.map((s, i) => (i < steps.length - 1
      ? `<button data-zoom="${s.path}">${esc(s.title)}</button><span>/</span>`
      : `<strong>${esc(s.title)}</strong>`)).join("");
    find();
  };

  /** Dim every chip whose pages do not match what is typed. */
  const find = () => {
    const query = field.value.trim().toLowerCase();
    const hit = (url: string) => {
      const p = pages.get(url);
      return !!p && [p.title, p.desc, ...p.sections.map((s) => s.name)].join(" ").toLowerCase().includes(query);
    };
    stage.querySelectorAll<SVGGElement>("[data-url],[data-urls]").forEach((g) => {
      const urls = (g.dataset.url ?? g.dataset.urls ?? "").split(" ");
      g.classList.toggle("mm-dim", !!query && !urls.some(hit));
    });
  };

  /** Enter or leave a folder. */
  const zoom = (path: string) => { root = path; tip.hidden = true; draw(); };

  // Folder titles and the trail zoom, by click or Enter
  const zoomed = (e: Event) => (e.target as Element).closest<HTMLElement | SVGElement>("[data-zoom]");
  document.addEventListener("click", (e) => { const at = zoomed(e); if (at) zoom(at.dataset.zoom!); });
  stage.addEventListener("keydown", (e) => { const at = zoomed(e); if (at && e.key === "Enter") zoom(at.dataset.zoom!); });

  // Typing finds pages; Enter opens the first one found
  field.addEventListener("input", find);
  field.addEventListener("keydown", (e) => {
    const link = stage.querySelector("[data-url]:not(.mm-dim) a")?.getAttribute("href");
    if (e.key !== "Enter" || !field.value.trim() || !link) return;
    const framed = document.documentElement.classList.contains("mm-embedded");
    (framed ? top ?? window : window).location.href = new URL(link, location.href).href;
  });

  // The hover card: the page's title, path, description and size
  stage.addEventListener("mousemove", (e) => {
    const g = (e.target as Element).closest<SVGGElement>("[data-url]");
    const page = g && pages.get(g.dataset.url!);
    tip.hidden = !page;
    if (!page) return;
    tip.innerHTML = card(page);
    tip.style.left = `${Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8)}px`;
    tip.style.top = `${Math.min(e.clientY + 14, innerHeight - tip.offsetHeight - 8)}px`;
  });
  stage.addEventListener("mouseleave", () => { tip.hidden = true; });

  new ResizeObserver(draw).observe(stage);
}

/** A page's hover card. */
function card(page: MapPage): string {
  const facts = `${page.words} words · ${page.sections.length} sections`;
  return `<b>${esc(page.title)}</b><p>${esc(page.url)} · ${facts}</p>${page.desc ? `<p>${esc(page.desc)}</p>` : ""}`;
}
