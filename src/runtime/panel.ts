/** The deck's narration: the card in focus as text, beside the drawing. Its trail up to the root,
 *  its one-line meaning, its detail, its parts and what it connects to; then the steps before and
 *  after it in reading order. Every card named in it is a button that moves the focus there. */

import type { Deck } from "../render/blocks.js";
import { esc } from "../render/text.js";


/** The panel's text for `id`; incoming links are listed with outgoing ones. */
export function panel(deck: Deck, id: string): string {
  const card = deck.cards[id]!;
  const at = deck.order.indexOf(id);
  const go = (to: string, text = deck.cards[to]!.title, cls = "") =>
    `<button class="mm-go${cls}" data-card="${to}">${esc(text)}</button>`;

  const trail: string[] = [];
  for (let up = card.parent; up; up = deck.cards[up]!.parent) trail.unshift(go(up));
  const coming = Object.values(deck.cards).flatMap((c) => c.to.filter((t) => t.id === id).map((t) => ({ id: c.id, label: t.label })));
  // A link's text is shown only where it says more than the name of the card it points to
  const row = (arrow: string, other: string, label: string, target: string) =>
    `<li><span class="mm-arrow">${arrow}</span>${go(other)}`
    + (label.toLowerCase() === deck.cards[target]!.title.toLowerCase() ? "" : `<span class="mm-quiet-text">${esc(label)}</span>`)
    + "</li>";
  const out = card.to.map((t) => row("→", t.id, t.label, t.id));
  const into = coming.map((t) => row("←", t.id, t.label, id));
  const prev = deck.order[at - 1];
  const next = deck.order[at + 1];

  return `<nav class="mm-crumbs">${trail.join('<span class="mm-sep">/</span>')}</nav>`
    + `<div class="mm-card-view">`
    + `<div class="mm-eyebrow">${card.parent ? `part ${deck.cards[card.parent]!.kids.indexOf(id) + 1} of ${deck.cards[card.parent]!.kids.length}` : "overview"}</div>`
    + `<h2 class="mm-card-title mm-h${card.hue <= 4 ? card.hue : 0}">${esc(card.title)}</h2>`
    + (card.summary ? `<div class="mm-lead">${card.summary}</div>` : "")
    + (card.body.trim() ? `<div class="mm-body">${card.body}</div>` : "")
    + (card.kids.length ? `<h3>Parts</h3><div class="mm-parts">${card.kids.map((k) => go(k, undefined, " mm-part")).join("")}</div>` : "")
    + (out.length || into.length ? `<h3>Connects</h3><ul class="mm-rel">${[...out, ...into].join("")}</ul>` : "")
    + `</div><footer class="mm-steps">`
    + `<button class="mm-step" data-card="${prev ?? ""}" ${prev ? "" : "disabled"} aria-label="Previous card">←</button>`
    + `<span class="mm-count-text">${at + 1} / ${deck.order.length}</span>`
    + `<button class="mm-step" data-card="${next ?? ""}" ${next ? "" : "disabled"} aria-label="Next card">→</button></footer>`;
}

/** Swap the panel's text, the old sliding out and the new in, the way the reader moved. */
export async function turn(host: HTMLElement, html: string, forward: boolean, reduce: boolean) {
  const view = host.querySelector<HTMLElement>(".mm-card-view");
  const shift = forward ? 14 : -14;
  if (view && !reduce) {
    await view.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-shift}px)` }],
      { duration: 130, easing: "ease-in", fill: "forwards" }).finished.catch(() => undefined);
  }
  host.innerHTML = html;
  host.scrollTop = 0;
  if (reduce) return;
  host.querySelector(".mm-card-view")?.animate(
    [{ opacity: 0, transform: `translateX(${shift}px)` }, { opacity: 1, transform: "none" }],
    { duration: 260, easing: "cubic-bezier(.2,.8,.2,1)" });
}
