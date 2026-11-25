/** A markdown page read as a deck of cards, one per heading.
 *
 *  | Markdown | Card |
 *  |---|---|
 *  | `#` (or the page title) | the root: what the whole thing is |
 *  | `##`, `###`, `####` | parts, and parts of parts, in reading order |
 *  | a section's first paragraph | the card's one-line meaning |
 *  | the rest of the section | its detail, shown when the card is in focus |
 *  | a link to a heading in the page (`[pages](#build)`) | a relationship, labelled by the link's text |
 *
 *  Card ids are the anchors the site gives the same headings, so a card and its section share a
 *  link. Links to other pages are checked and rewritten as the diagrams' are. */

import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import { Marked, type Token, type Tokens } from "marked";
import type { Config } from "./config.js";
import { resolve, type Link } from "./links.js";
import type { Card, Deck } from "./render/blocks.js";
import type { Page, Site } from "./site.js";


/** Headings deeper than this are detail inside a card, not cards of their own. */
const DEEPEST = 4;

/** A deck read, with every link that left the page and where it went. */
export type Read = { deck: Deck; links: { node: string; link: Link }[] };


/** The page's text as a deck whose page links are relative to `from`. */
export function deck(site: Site, page: Page, text: string, config: Config, from: string, href: string): Read {
  const tokens = new Marked().lexer(matter(text).content);
  const slugger = new GithubSlugger();
  const cards: Record<string, Card> = {};
  const order: string[] = [];
  const held = new Map<string, Token[]>();
  const stack: Card[] = [];

  // Cards from headings: each holds the tokens up to the next heading; a first `#` is the root
  const open = (title: string, depth: number) => {
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const parent = stack[stack.length - 1] ?? null;
    const id = slugger.slug(title);
    const card: Card = { id, title, summary: "", body: "", depth, parent: parent?.id ?? null, kids: [], to: [], hue: 0 };
    parent?.kids.push(id);
    // A part of the root takes the next hue; its own parts wear it too
    if (parent) card.hue = parent.parent === null ? parent.kids.length : parent.hue;
    cards[id] = card;
    order.push(id);
    held.set(id, []);
    stack.push(card);
  };
  const first = tokens.find((t): t is Tokens.Heading => t.type === "heading");
  if (first?.depth !== 1) open(page.title, 1);
  for (const t of tokens) {
    if (t.type === "heading" && t.depth <= DEEPEST && (t.depth > 1 || !order.length)) open(plain(t.text), t.depth);
    else if (!(t.type === "code" && /^(cards|sitemap)\b/.test(String((t as Tokens.Code).lang ?? "")))) {
      held.get(stack[stack.length - 1]?.id ?? "")?.push(t);
    }
  }

  // Each card's text as HTML: links to cards become relationships, page links are checked
  const links: Read["links"] = [];
  for (const card of Object.values(cards)) {
    const marked = new Marked({
      renderer: {
        link({ href: ref, tokens: inner }) {
          const label = this.parser.parseInline(inner);
          const anchor = ref.startsWith("#") ? ref.slice(1) : "";
          if (anchor && cards[anchor]) {
            if (anchor !== card.id && !card.to.some((t) => t.id === anchor)) {
              card.to.push({ id: anchor, label: plain(label.replace(/<[^>]+>/g, "")) });
            }
            return `<a href="#${anchor}" data-card="${anchor}">${label}</a>`;
          }
          const link = resolve(site, ref, from, config.urls);
          if (link.kind === "broken" && !anchor) links.push({ node: card.id, link });
          const to = link.kind === "broken" ? ref : link.href;
          return `<a href="${to}"${link.kind === "external" ? ' rel="noopener"' : ""}>${label}</a>`;
        },
      },
    });
    const own = held.get(card.id) ?? [];
    const at = own.findIndex((t) => t.type === "paragraph");
    card.summary = at >= 0 ? marked.parser([own[at]!]) : "";
    card.body = marked.parser(own.filter((_, i) => i !== at));
  }
  return { deck: { title: cards[order[0]!]!.title, root: order[0]!, cards, order, source: href }, links };
}

/** Inline markdown reduced to its words. */
function plain(text: string): string {
  return text.replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1").replace(/[`*_~]/g, "").trim();
}
