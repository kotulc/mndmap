/** A deck on its page: one card in focus at a time. The card in focus and every card holding it
 *  are open, boxes round their parts; every other card is closed, a block saying its name and
 *  meaning. Moving the focus re-lays the blocks and animates between the two layouts while the
 *  camera flies: parts rise into a box that opens, a box that closes folds its parts away, and
 *  the rest slide aside. The focus's relationships then draw in, and the panel tells it.
 *
 *  | Move | Does |
 *  |---|---|
 *  | → ↓ Space, the panel's → | the next card in reading order |
 *  | ← ↑, the panel's ← | the one before |
 *  | Esc, Backspace, a click on the ground | out to the card that holds this one |
 *  | a click on a block, a card named in the panel | that card |
 *
 *  Text holds a readable size (it scales with the zoom only within a band), and a block shows
 *  its meaning, its name, or only its colour, as its size on screen allows. The level is picked
 *  when a flight lands, never during it (mndflow's ladder). */

import { lay, type Box, type Deck } from "../render/blocks.js";
import { esc } from "../render/text.js";
import { fit, fly, now, transform, type View } from "./camera.js";
import { draw, lines, trace } from "./lines.js";
import { panel, turn } from "./panel.js";


/** A flight's length, and how far into it the lines start to draw. */
const FLIGHT = 760;
const TRACE = .7;

/** The layout's easing, matched to the camera's. */
const EASE = "cubic-bezier(.65,0,.35,1)";


/** Run the deck in `host` (holding `.mm-viewport > .mm-world` and `.mm-panel`). */
export function deck(host: HTMLElement, data: Deck) {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const viewport = host.querySelector<HTMLElement>(".mm-viewport")!;
  const world = viewport.querySelector<HTMLElement>(".mm-world")!;
  const side = host.querySelector<HTMLElement>(".mm-panel")!;

  // Every card's block, made once, over the lines; parents first so their parts sit over them
  world.innerHTML = `<svg class="mm-lines"><defs><marker id="mm-deck-head" viewBox="0 0 10 10" refX="9" refY="5"`
    + ` markerWidth="8" markerHeight="8" markerUnits="userSpaceOnUse" orient="auto"><path d="M0,1L10,5L0,9z"/>`
    + `</marker></defs><g></g></svg>` + data.order.map((id) => block(data, id)).join("")
    + `<svg class="mm-lines mm-labels"><g></g></svg>`;
  const [svg, over] = [...world.querySelectorAll<SVGSVGElement>(".mm-lines")] as [SVGSVGElement, SVGSVGElement];
  const blocks = new Map([...world.querySelectorAll<HTMLElement>(".mm-block")].map((el) => [el.dataset.id!, el]));

  let focus = data.root;
  let boxes = new Map<string, Box>();
  const view = (): View => ({ w: viewport.clientWidth, h: viewport.clientHeight });

  /** The cards drawn open with `id` in focus: it and every card holding it. */
  const opened = (id: string) => {
    const out = new Set<string>();
    for (let at: string | null = id; at; at = data.cards[at]!.parent) out.add(at);
    return out;
  };

  /** What the camera frames for `id`: its own box when open, else the box holding it. */
  const framed = (id: string) => (data.cards[id]!.kids.length ? id : data.cards[id]!.parent ?? id);

  /** Move every block to its place in `next`, animating from where it was. */
  const arrange = (next: Map<string, Box>, open: Set<string>, ms: number) => {
    const root = next.get(data.root)!;
    for (const el of [world, svg, over]) { el.style.width = `${root.w}px`; el.style.height = `${root.h}px`; }
    for (const [id, el] of blocks) {
      const was = boxes.get(id);
      const box = next.get(id);
      el.classList.toggle("mm-boxed", open.has(id) && data.cards[id]!.kids.length > 0);
      el.classList.toggle("mm-leaf", !el.classList.contains("mm-boxed"));
      if (!box) {
        const into = ancestor(id, next);
        if (was && into && ms) {
          el.animate([{ ...at(was), opacity: 1 }, { ...at(into), opacity: 0 }], { duration: ms * .6, easing: EASE })
            .finished.then(() => { el.hidden = !boxes.has(id); }, () => undefined);
        } else el.hidden = true;
        continue;
      }
      Object.assign(el.style, at(box));
      el.hidden = false;
      if (!ms) continue;
      const from = was ?? ancestor(id, boxes);
      if (was) el.animate([at(was), at(box)], { duration: ms, easing: EASE });
      else if (from) el.animate([{ ...at(from), opacity: 0 }, { opacity: .4, offset: .35 }, { ...at(box), opacity: 1 }],
        { duration: ms, easing: EASE });
    }
    boxes = next;
  };

  /** The box of the nearest card holding `id` in a layout. */
  const ancestor = (id: string, layout: Map<string, Box>) => {
    for (let at = data.cards[id]!.parent; at; at = data.cards[at]!.parent) if (layout.has(at)) return layout.get(at)!;
    return undefined;
  };

  /** Pick each block's level for the scale landed at, and the text's counter-scale. */
  const level = (s: number) => {
    world.style.setProperty("--k", String(Math.min(Math.max(s, .85), 1.15) / s));
    for (const [id, el] of blocks) {
      const b = boxes.get(id);
      if (!b) continue;
      const w = b.w * s;
      const h = (el.classList.contains("mm-boxed") ? 84 : b.h) * s;
      el.dataset.lod = w < 64 || h < 26 ? "0" : w < 150 || h < 70 ? "1" : "2";
    }
  };

  /** Light the focus, what holds it, its parts and the ends of its lines; quiet the rest. */
  const mark = (id: string, ends: Set<string>, open: Set<string>) => {
    const parts = new Set(data.cards[id]!.kids);
    for (const [c, el] of blocks) {
      el.classList.toggle("mm-focus", c === id);
      el.classList.toggle("mm-dim", id !== data.root && !open.has(c) && !parts.has(c) && !ends.has(c));
    }
  };

  /** Move the focus to a card: re-lay, fly there, mark it, draw its lines, tell it in the panel. */
  const show = (id: string, first = false) => {
    if (!data.cards[id] || (id === focus && !first)) return;
    const before = focus;
    focus = id;
    const v = view();
    const open = opened(id);
    const ms = first || reduce ? 0 : FLIGHT;
    const from = now(world, v);
    arrange(lay(data, (c) => open.has(c), v.w / v.h), open, ms);
    const to = fit(boxes.get(framed(id))!, v);
    const via = first ? null : across(data, before, id);

    const found = lines(data, id, framed(id), boxes);
    mark(id, new Set(found.flatMap((l) => (l.lit ? [l.from, l.to] : []))), open);
    const drawn = draw(found, boxes, Math.min(Math.max(to.s, .85), 1.15) / to.s, id);
    for (const el of [svg, over]) el.setAttribute("viewBox", `0 0 ${boxes.get(data.root)!.w} ${boxes.get(data.root)!.h}`);
    svg.querySelector("g")!.innerHTML = drawn.paths;
    over.querySelector("g")!.innerHTML = drawn.labels;
    trace(svg, over, first ? 450 : ms * TRACE, reduce);
    turn(side, panel(data, id), data.order.indexOf(id) >= data.order.indexOf(before), reduce || first);
    if (location.hash.slice(1) !== id) history.replaceState(null, "", `#${id}`);
    const through = via && boxes.get(via) ? fit(boxes.get(via)!, v) : null;
    fly(world, v, from ?? to, to, through, ms).then(() => { if (focus === id) level(to.s); });
  };

  // Moving: blocks and named cards focus; the ground goes up; keys step through reading order
  const named = (e: Event) => (e.target as Element).closest<HTMLElement>("[data-card]");
  host.addEventListener("click", (e) => {
    const go = named(e);
    if (go?.dataset.card) { e.preventDefault(); show(go.dataset.card); return; }
    const hit = (e.target as Element).closest<HTMLElement>(".mm-block");
    if (hit && viewport.contains(hit)) show(hit.dataset.id!);
    else if (viewport.contains(e.target as Node) && !(e.target as Element).closest("a")) up();
  });
  const step = (by: number) => show(data.order[data.order.indexOf(focus) + by] ?? focus);
  const up = () => show(data.cards[focus]!.parent ?? focus);
  document.addEventListener("keydown", (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || (e.target as Element).closest("input, textarea")) return;
    const keys: Record<string, () => void> = {
      ArrowRight: () => step(1), ArrowDown: () => step(1), " ": () => step(1),
      ArrowLeft: () => step(-1), ArrowUp: () => step(-1), Escape: up, Backspace: up,
    };
    if (keys[e.key]) { e.preventDefault(); keys[e.key]!(); }
  });
  addEventListener("hashchange", () => show(decodeURIComponent(location.hash.slice(1)) || data.root));
  new ResizeObserver(() => {
    const v = view();
    const open = opened(focus);
    world.getAnimations().forEach((a) => a.finish());
    arrange(lay(data, (c) => open.has(c), v.w / v.h), open, 0);
    const shot = fit(boxes.get(framed(focus))!, v);
    world.style.transform = transform(shot, v);
    level(shot.s);
  }).observe(viewport);

  // A swipe across the drawing or the panel steps, as a feed is read on a phone
  let start: { x: number; y: number } | null = null;
  host.addEventListener("pointerdown", (e) => { start = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY }; });
  host.addEventListener("pointerup", (e) => {
    const dx = start ? e.clientX - start.x : 0;
    if (start && Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(e.clientY - start.y) * 1.5) step(dx < 0 ? 1 : -1);
    start = null;
  });

  // Arrival: the first card's blocks rise in one after another, then its lines draw
  show(decodeURIComponent(location.hash.slice(1)) || data.root, true);
  if (!reduce) {
    [...blocks.values()].filter((el) => !el.hidden).forEach((el, i) => el.animate(
      [{ opacity: 0, transform: "translateY(14px) scale(.96)" }, { opacity: 1, transform: "none" }],
      { duration: 480, delay: 80 + i * 70, easing: "cubic-bezier(.2,.8,.2,1)", fill: "backwards" }));
  }
}


/** The box that holds both cards, when a flight between them should rise through it: neither
 *  holds the other, and it is not where the flight starts or ends. */
function across(deck: Deck, a: string, b: string): string | null {
  const line = (id: string) => {
    const out: string[] = [];
    for (let at: string | null = id; at; at = deck.cards[at]!.parent) out.push(at);
    return out;
  };
  const ups = new Set(line(a));
  const shared = line(b).find((id) => ups.has(id));
  return shared && shared !== a && shared !== b && shared !== deck.cards[b]!.parent && shared !== deck.cards[a]!.parent
    ? shared : null;
}

/** A box as a block's place and size. */
function at(b: Box) {
  return { left: `${b.x}px`, top: `${b.y}px`, width: `${b.w}px`, height: `${b.h}px` };
}

/** A card's block: its name, how many parts it has, and its meaning. Open or closed is a class. */
function block(deck: Deck, id: string): string {
  const card = deck.cards[id]!;
  const parts = card.kids.length;
  const hue = card.hue <= 4 ? card.hue : 0;
  return `<div class="mm-block mm-leaf mm-h${hue}" data-id="${id}" hidden>`
    + `<div class="mm-block-head"><span class="mm-block-title">${esc(card.title)}</span>`
    + (parts ? `<span class="mm-block-count">${parts}</span>` : "") + "</div>"
    + `<div class="mm-block-sum">${card.summary.replace(/<[^>]+>/g, "")}</div></div>`;
}
