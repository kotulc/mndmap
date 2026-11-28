/** A markdown page read as a deck of cards, one per heading, inferred from plain markdown alone.
 *
 *  | Markdown | Card |
 *  |---|---|
 *  | `#` (or the page title) | the root: what the whole thing is |
 *  | `##`, `###`, `####` | parts, and parts of parts, in reading order |
 *  | a list whose every item leads with a term (`**Term** — …`) | a part per item |
 *  | a numbered list | a part per step, each leading to the next |
 *  | a bold label over a list (`**Phase 1**` then items) | a part holding the list |
 *  | the first sentence, when a section opens with a paragraph | the card's one-line meaning |
 *  | the rest of the section | its detail, shown when the card is in focus |
 *  | a link to a heading in the page (`[pages](#build)`) | a relationship, labelled by the link's text |
 *  | a section naming another section's heading | a relationship, unlabelled |
 *
 *  Card ids are the anchors the site gives the same headings, so a card and its section share a
 *  link. Links to other pages are checked and rewritten as the diagrams' are. */

import { posix } from "node:path";
import GithubSlugger from "github-slugger";
import matter from "gray-matter";
import { Marked, type Token, type Tokens } from "marked";
import type { Config } from "./config.js";
import { href as href_to, resolve, type Link } from "./links.js";
import type { Card, Deck } from "./render/blocks.js";
import { esc } from "./render/text.js";
import { plain, type Page, type Site } from "./site.js";


/** Headings deeper than this are detail inside a card, not cards of their own. */
const DEEPEST = 4;

/** A list item that leads with a term: `**Term** — text`, `**Term:** text` or `` `term` — text``. */
const TERMS = [
  /^\*\*(.+?):\*\*\s+([\s\S]+)$/, /^\*\*(.+?)\*\*\s*[—–:-]\s+([\s\S]+)$/, /^`([^`]+)`\s*[—–:-]\s+([\s\S]+)$/,
];

/** A paragraph that is only a bold label, with an aside after it: `**Phase 1** *(complete)*`. */
const LABEL = /^\*\*([^*\n]+)\*\*([^\n]*)$/;

/** A paragraph's first sentence and the rest. */
const SENTENCE = /^([\s\S]+?[.!?])\s+(?=[A-Z`*_[(])([\s\S]*)$/;

/** Mentions shorter than this are too likely to be chance. */
const SHORTEST = 4;

/** A deck read, with every link that left the page and where it went, and the pages it reached. */
export type Read = {
  deck: Deck; links: { node: string; link: Link }[]; pages: { node: string; url: string; hash?: string }[];
};


/** The page's text as a deck whose page links are relative to `from`. */
export function deck(
  site: Site, page: Page, text: string, config: Config, from: string, href: string,
): Read {
  const lexer = new Marked();
  const { content, data } = matter(text);
  const tokens = lexer.lexer(content);
  // Headings are slugged as the site slugs them (every heading, in order), so a heading's card
  // and its anchor share an id; parts and an untitled root have their own, which no anchor can
  // take: a part's is its card's id and its own slug, joined by a dot
  const slugger = new GithubSlugger();
  const parted = new GithubSlugger();
  const cards: Record<string, Card> = {};
  const order: string[] = [];
  const held = new Map<string, Token[]>();
  const headed = new Set<string>();
  const opens = new Map<string, string>();
  const steps = new Set<string>();
  const stack: Card[] = [];

  // A card under `parent`, holding `own`; a part of the root takes the next hue, its parts wear it
  const add = (id: string, title: string, depth: number, parent: Card | null, own: Token[] = []): Card => {
    const card: Card = {
      id, title, summary: "", body: "", face: "", depth, parent: parent?.id ?? null, kids: [], to: [], hue: 0,
    };
    parent?.kids.push(id);
    if (parent) card.hue = parent.parent === null ? parent.kids.length : parent.hue;
    cards[id] = card;
    order.push(id);
    held.set(id, own);
    return card;
  };

  // A heading's card, under the nearest shallower heading's
  const open = (id: string, title: string, depth: number) => {
    while (stack.length && stack[stack.length - 1]!.depth >= depth) stack.pop();
    const card = add(id, title, depth, stack[stack.length - 1] ?? null);
    headed.add(card.id);
    stack.push(card);
  };

  // Parts a list makes of `card`; how many tokens they took (none when the list isn't parts)
  const part = (title: string, card: Card, own: Token[] = []) => {
    const id = `${card.id}.${parted.slug(plain(title))}`;
    return Object.assign(add(id, plain(title), card.depth + 1, card, own), { part: true });
  };
  const split = (t: Token, next: Token | undefined, card: Card): number => {
    if (t.type === "list") {
      const items = (t as Tokens.List).items;
      if ((t as Tokens.List).ordered) {
        const made = items.map((i) => part(i.text, card));
        made.slice(1).forEach((s, i) => made[i]!.to.push({ id: s.id, label: "" }));
        made.forEach((s) => steps.add(s.id));
        return 1;
      }
      const terms = items.map((i) => TERMS.map((re) => re.exec(i.text)).find(Boolean));
      if (!terms.every(Boolean)) return 0;
      for (const [, term, rest] of terms as RegExpExecArray[]) part(term!, card, lexer.lexer(rest!));
      return 1;
    }
    const label = t.type === "paragraph" ? LABEL.exec(t.text) : null;
    if (!label || next?.type !== "list") return 0;
    part(label[1]!, card, [...lexer.lexer(label[2]!.trim()), next]);
    return 2;
  };

  // Cards from headings, and parts from the lists in them; a first `#` is the root
  const first = tokens.find((t): t is Tokens.Heading => t.type === "heading");
  if (first?.depth !== 1) open(parted.slug(page.title), page.title, 1);
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    const at = stack[stack.length - 1];
    const head = t.type === "heading" ? t as Tokens.Heading : null;
    const id = head ? slugger.slug(plain(head.text)) : "";
    if (head && head.depth <= DEEPEST && (head.depth > 1 || !order.length)) open(id, plain(head.text), head.depth);
    else if (t.type === "code" && /^(cards|sitemap)\b/.test(String((t as Tokens.Code).lang ?? ""))) continue;
    else if (at) {
      if (t.type !== "space" && !opens.has(at.id)) opens.set(at.id, t.type);
      const took = split(t, tokens[i + 1], at);
      if (took) i += took - 1;
      else held.get(at.id)!.push(t);
    }
  }

  // Each card's text as HTML: links to cards become relationships, page links are checked
  const links: Read["links"] = [];
  const pages: Read["pages"] = [];
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
          if (link.kind === "page") pages.push({ node: card.id, url: link.page.url, hash: link.hash });
          const to = link.kind === "broken" ? ref : link.href;
          return `<a href="${to}"${link.kind === "external" ? ' rel="noopener"' : ""}>${label}</a>`;
        },
        // Images beside the page, as seen from wherever the deck is published
        image({ href: src, text: alt }) {
          const local = !/^([a-z][a-z+.-]*:|\/|#)/i.test(src);
          const to = local ? href_to(from, `/${posix.join(posix.dirname(page.path), src)}`, config.urls) : src;
          return `<img src="${to}" alt="${alt.replace(/"/g, "&quot;")}">`;
        },
      },
    });

    // The meaning is the first sentence, only when the section opens with a paragraph
    const own = (held.get(card.id) ?? []).filter((t) => t.type !== "space");
    const opened = headed.has(card.id) ? opens.get(card.id) : own[0]?.type;
    const lead = opened === "paragraph" && own[0]?.type === "paragraph" ? (own[0] as Tokens.Paragraph).text : "";
    const [, said = lead, rest = ""] = SENTENCE.exec(lead) ?? [];
    card.summary = said ? `<p>${marked.parseInline(said)}</p>` : "";
    card.body = (rest ? marked.parse(rest) as string : "") + marked.parser(lead ? own.slice(1) : own);

    // Closed, it says the page's description (the root), its meaning, or what it holds
    const described = card.parent === null && typeof data.description === "string" ? esc(data.description) : "";
    card.face = described || card.summary.replace(/<[^>]+>/g, "").trim() || digest(card, own, cards, steps);
  }
  mentions(cards, headed);
  return { deck: { title: cards[order[0]!]!.title, root: order[0]!, cards, order, source: href }, links, pages };
}

/** What a card without a meaning holds, told in a line: its parts (steps, when every part is one
 *  of `steps`), tables, code, lists. */
export function digest(card: Card, own: Token[], cards: Record<string, Card>, steps = new Set<string>()): string {
  const told: string[] = [];
  const titles = card.kids.map((k) => cards[k]!.title);
  if (titles.length) {
    const named = titles.slice(0, 3).join(", ") + (titles.length > 3 ? ", …" : "");
    told.push(`${titles.length} ${card.kids.every((k) => steps.has(k)) ? "steps" : "parts"}: ${named}`);
  }
  for (const t of own) {
    if (t.type === "table") {
      const heads = (t as Tokens.Table).header.map((h) => plain(h.text)).join(", ");
      told.push(`a table of ${(t as Tokens.Table).rows.length} (${heads})`);
    } else if (t.type === "code") told.push("a code block");
    else if (t.type === "list") told.push(`a list of ${(t as Tokens.List).items.length}`);
  }
  return esc(told.join(" · "));
}

/** Link each section to the sections whose headings it names, unless one holds the other. */
function mentions(cards: Record<string, Card>, headed: Set<string>) {
  const holds = (a: string, b: string) => {
    for (let c = cards[b]; c; c = c.parent ? cards[c.parent] : undefined) if (c.id === a) return true;
    return false;
  };
  for (const id of headed) {
    const card = cards[id]!;
    for (const other of headed) {
      const title = cards[other]!.title;
      const linked = holds(id, other) || holds(other, id) || card.to.some((t) => t.id === other);
      if (title.length < SHORTEST || linked) continue;
      const word = new RegExp(`(^|[^\\w])(${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})(?!\\w)`);
      if (!word.test(`${card.summary} ${card.body}`.replace(/<[^>]+>/g, " "))) continue;
      card.to.push({ id: other, label: "" });
      const summary = mark(card.summary, other, word);
      if (summary !== card.summary) card.summary = summary;
      else card.body = mark(card.body, other, word);
    }
  }
}

/** The first mention outside a tag, link or code in `html`, made a link to card `id`. */
function mark(html: string, id: string, word: RegExp): string {
  let done = false;
  return html.split(/(<a\b[\s\S]*?<\/a>|<code>[\s\S]*?<\/code>|<[^>]+>)/).map((part, i) => {
    if (done || i % 2) return part;
    return part.replace(word, (all, pre: string, name: string) => {
      done = true;
      return `${pre}<a href="#${id}" data-card="${id}">${name}</a>`;
    });
  }).join("");
}
