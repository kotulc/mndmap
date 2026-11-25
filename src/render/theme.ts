/** The drawings' look: mndflow's colour ramp and type, as one stylesheet scoped under `.mm`.
 *
 *  A drawing follows its host's theme: `html.dark` / `html.light` (next-themes, as mndsite sets
 *  them), `[data-theme]`, or else the reader's system setting. Grounds stay neutral; colour is a
 *  thin mark: a chip's left edge, a card's border. The accent is for what is hovered or current,
 *  warn for a link that names no page.
 *
 *  The sheet is written to survive being inlined into markdown: every colour is worked out here
 *  as a literal, so it holds no `*`, `_`, quotes, `&`, `<` or `>` for MDX or React to rewrite. */


/** A dark ladder from mndflow: `retro` (its greens, the default) or `modern` (its cyanotype). */
export type Dark = "retro" | "modern";

/** A theme: lightness per step, and the primary and neutral hues with their chroma. */
type Ladder = {
  ground: number; fill: number; raised: number; line: number; stroke: number; edge: number;
  dim: number; ink: number; ph: number; pc: number; nh: number; nc: number; scheme: string;
};

/** mndflow's three themes (`ramp.css`). */
const LADDERS: Record<Dark | "light", Ladder> = {
  retro: { ground: .145, fill: .195, raised: .255, line: .335, stroke: .42, edge: .8, dim: .6, ink: .88,
    ph: 150, pc: .19, nh: 160, nc: .05, scheme: "dark" },
  modern: { ground: .225, fill: .275, raised: .335, line: .45, stroke: .545, edge: .86, dim: .68, ink: .945,
    ph: 230, pc: .13, nh: 245, nc: .075, scheme: "dark" },
  light: { ground: .958, fill: .985, raised: .93, line: .8, stroke: .62, edge: .55, dim: .495, ink: .265,
    ph: 235, pc: .14, nh: 232, nc: .026, scheme: "light" },
};

/** Identity hues for top-level folders, in fixed order (validated for colour-blind separation
 *  at one lightness and chroma); later folders stay neutral rather than repeat one. */
export const HUES = [210, 25, 290, 100];

/** The drawing rules: grounds, boxes, chips, cards, routes, and their hover and current states. */
const RULES = `
svg.mm{display:block;max-width:100%;height:auto;margin:1.5rem auto}
.mm text{font-family:var(--mm-font);font-size:13px;fill:var(--mm-ink)}
.mm .mm-ground{fill:var(--mm-ground)}
.mm .mm-box{fill:none;stroke:var(--mm-line)}
.mm .mm-title{font-weight:600}
.mm .mm-mid{text-anchor:middle}
.mm .mm-quiet{fill:var(--mm-dim);font-weight:400}
.mm .mm-small{font-size:11px}
.mm .mm-chip{fill:var(--mm-fill);stroke:var(--mm-line)}
.mm .mm-edge{fill:var(--mm-stroke)}
.mm .mm-count{fill:none;stroke:var(--mm-line)}
.mm .mm-row{fill:var(--mm-dim)}
.mm a .mm-row:hover{fill:var(--mm-accent);text-decoration:underline}
.mm .mm-card{fill:var(--mm-fill);stroke:var(--mm-stroke);stroke-width:1.2}
.mm .mm-linked .mm-card{stroke:var(--mm-id);stroke-width:1.6}
.mm .mm-broken .mm-card{stroke:var(--mm-warn);stroke-dasharray:4 3}
.mm .mm-broken .mm-icon{stroke:var(--mm-warn)}
.mm .mm-icon{fill:none;stroke:var(--mm-dim);stroke-width:1.2;stroke-linecap:round;stroke-linejoin:round}
.mm .mm-route{fill:none;stroke:var(--mm-route);stroke-width:1.4}
.mm .mm-route.mm-thick{stroke-width:2.6}
.mm .mm-route.mm-dotted{stroke-dasharray:3 4}
.mm .mm-head{fill:var(--mm-route-head)}
.mm .mm-label-ground{fill:var(--mm-ground)}
.mm .mm-label{font-size:11px;fill:var(--mm-dim)}
.mm a{cursor:pointer}
.mm a:hover .mm-chip,.mm a:focus-visible .mm-chip,.mm a:hover .mm-card,.mm a:focus-visible .mm-card{fill:var(--mm-wash);stroke:var(--mm-accent)}
.mm a:focus{outline:none}
.mm .mm-current .mm-chip{stroke:var(--mm-accent);stroke-width:2}
.mm .mm-dim{opacity:.28}
.mm .mm-lit .mm-card,.mm .mm-lit .mm-chip{stroke:var(--mm-accent);fill:var(--mm-wash)}
.mm .mm-route.mm-lit{stroke:var(--mm-accent)}
${HUES.map((h, i) => `.mm .mm-h${i + 1}{--mm-id:oklch(var(--mm-edge-l) .14 ${h})}.mm .mm-h${i + 1} .mm-edge{fill:var(--mm-id)}`)
    .join("")}`;


/** A ladder's named colours, each a literal. */
function roles(l: Ladder): string {
  const at = (k: number) => Math.round(k * 1e4) / 1e4;
  const n = (light: number, k: number) => `oklch(${light} ${at(l.nc * k)} ${l.nh})`;
  const p = (light: number, k: number) => `oklch(${light} ${at(l.pc * k)} ${l.ph})`;
  return [
    `color-scheme:${l.scheme}`, `--mm-edge-l:${l.edge}`,
    `--mm-ground:${n(l.ground, .3)}`, `--mm-fill:${n(l.fill, .35)}`, `--mm-raised:${n(l.raised, .4)}`,
    `--mm-line:${n(l.line, .55)}`, `--mm-stroke:${n(l.stroke, .6)}`, `--mm-dim:${n(l.dim, .7)}`,
    `--mm-ink:${n(l.ink, 1)}`, `--mm-accent:${p(l.edge, 1)}`, `--mm-route:${p(l.stroke, .45)}`,
    `--mm-route-head:${p(l.dim, .3)}`, `--mm-warn:oklch(${l.edge} .14 50)`,
  ].join(";");
}

/** The stylesheet for drawings set under `.mm`, dark from the given ladder. */
export function theme(dark: Dark = "retro"): string {
  const scoped = ":root:not(.light):not([data-theme=light])";
  const base = "--mm-id:var(--mm-stroke);--mm-wash:color-mix(in oklch,var(--mm-accent) 14%,var(--mm-fill));"
    + "--mm-font:ui-monospace,Cascadia Mono,Consolas,DejaVu Sans Mono,monospace";
  return `.mm{${roles(LADDERS.light)};${base}}`
    + `@media (prefers-color-scheme:dark){${scoped} .mm,${scoped}.mm{${roles(LADDERS[dark])}}}`
    + `.dark .mm,.mm.dark,[data-theme=dark] .mm{${roles(LADDERS[dark])}}`
    + `.light .mm,.mm.light,[data-theme=light] .mm{${roles(LADDERS.light)}}`
    + RULES.replace(/\n/g, "");
}
