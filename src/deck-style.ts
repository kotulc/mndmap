/** The deck page's styles: the stage the cards are drawn on, the blocks at each level of detail,
 *  the relationship lines, and the narration panel. Colours are the theme's (`render/theme.ts`). */

export const DECK_CSS = `
html.mm-deck-page main{max-width:none;padding:0}
.mm-deck{display:grid;grid-template-columns:minmax(0,1fr) 400px;height:calc(100vh - 53px)}
html.mm-embedded .mm-deck{height:100vh}
@media (max-width:980px){.mm-deck{grid-template-columns:minmax(0,1fr);grid-template-rows:minmax(0,56%) minmax(0,44%)}}
.mm-viewport{position:relative;overflow:hidden;cursor:zoom-out;background:var(--mm-ground);touch-action:pan-y}
.mm-world{position:absolute;left:0;top:0;transform-origin:0 0;will-change:transform;--k:1}
.mm-block{position:absolute;box-sizing:border-box;border-radius:5px;cursor:pointer;
transition:opacity .4s ease,box-shadow .25s,background-color .25s,border-color .25s}
.mm-leaf{background:var(--mm-fill);border:1px solid var(--mm-line);border-left:3px solid var(--mm-id)}
.mm-boxed{border:1px solid var(--mm-line)}
.mm-boxed.mm-h1,.mm-boxed.mm-h2,.mm-boxed.mm-h3,.mm-boxed.mm-h4{border-top:2px solid var(--mm-id)}
.mm-block-head{display:flex;align-items:baseline;gap:8px;padding:calc(12px * var(--k)) 14px 2px;min-width:0}
.mm-block-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
font-weight:700;font-size:calc(15px * var(--k));color:var(--mm-ink)}
.mm-block-count{flex:none;padding:0 5px;border:1px solid var(--mm-line);border-radius:3px;
font-size:calc(11px * var(--k));color:var(--mm-dim)}
.mm-block-sum{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:4;overflow:hidden;
padding:4px 14px 0;font-size:calc(12.5px * var(--k));line-height:1.45;color:var(--mm-dim)}
.mm-boxed .mm-block-sum{-webkit-line-clamp:2}
.mm-block-head,.mm-block-sum{transition:opacity .2s}
.mm-block[data-lod="1"] .mm-block-sum,.mm-block[data-lod="0"] .mm-block-sum,.mm-block[data-lod="0"] .mm-block-head{opacity:0}
.mm-block:hover{border-color:var(--mm-accent)}
.mm-block.mm-focus{border-color:var(--mm-accent);
box-shadow:0 0 0 calc(2px * var(--k)) color-mix(in oklch,var(--mm-accent) 45%,transparent),0 0 calc(36px * var(--k)) color-mix(in oklch,var(--mm-accent) 22%,transparent)}
.mm-leaf.mm-focus{background:var(--mm-wash)}
.mm-block.mm-dim{opacity:.26}
.mm-lines{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.mm-line{fill:none;stroke:var(--mm-route);stroke-width:calc(1.6px * var(--k));stroke-dasharray:1;marker-end:url(#mm-deck-head)}
.mm-line.mm-lit{stroke:var(--mm-accent);stroke-width:calc(2px * var(--k))}
#mm-deck-head path{fill:var(--mm-dim)}
.mm-line-label rect{fill:var(--mm-ground);stroke:var(--mm-line)}
.mm-line-label text{fill:var(--mm-dim);text-anchor:middle;font-family:var(--mm-font)}
.mm-line-label.mm-lit text{fill:var(--mm-ink)}
.mm-line-label.mm-lit rect{stroke:var(--mm-accent)}
.mm-hint{position:absolute;left:12px;bottom:10px;color:var(--mm-dim);font-size:11px;pointer-events:none}
.mm-open{position:absolute;right:10px;top:10px;display:none;padding:3px 9px;border:1px solid var(--mm-line);
border-radius:4px;background:var(--mm-ground);color:var(--mm-dim);font-size:12px}
.mm-open:hover{border-color:var(--mm-accent);color:var(--mm-ink);text-decoration:none}
html.mm-embedded .mm-open{display:block}
.mm-panel{display:flex;flex-direction:column;min-height:0;overflow:auto;padding:18px 24px 0;
border-left:1px solid var(--mm-line);background:var(--mm-fill)}
@media (max-width:980px){.mm-panel{border-left:0;border-top:1px solid var(--mm-line)}}
.mm-crumbs{display:flex;flex-wrap:wrap;gap:6px;min-height:18px;font-size:12px;color:var(--mm-dim)}
.mm-go{all:unset;cursor:pointer;color:var(--mm-accent)}
.mm-go:hover,.mm-go:focus-visible{text-decoration:underline}
.mm-card-view{flex:1}
.mm-card-view .mm-eyebrow{margin-top:14px}
.mm-card-title{margin:6px 0 12px;padding-left:10px;border-left:3px solid var(--mm-id);font-size:20px;line-height:1.3;
text-transform:none;letter-spacing:normal;color:var(--mm-ink)}
.mm-lead{font-size:14px;line-height:1.6;color:var(--mm-ink)}
.mm-lead p,.mm-body p{margin:0 0 10px}
.mm-body{font-size:13px;line-height:1.65;color:var(--mm-dim)}
.mm-body ul,.mm-body ol{margin:0 0 10px;padding-left:20px}
.mm-body code,.mm-lead code{padding:0 4px;border:1px solid var(--mm-line);border-radius:3px;font-size:.92em}
.mm-body pre{margin:0 0 10px;font-size:11.5px}.mm-body pre code{padding:0;border:0}
.mm-body table{margin:0 0 10px;font-size:12px}
.mm-panel h3{margin:22px 0 8px;font-size:11px;font-weight:400;letter-spacing:.14em;text-transform:uppercase;color:var(--mm-dim)}
.mm-parts{display:flex;flex-wrap:wrap;gap:6px}
.mm-part{padding:4px 10px;border:1px solid var(--mm-line);border-left:3px solid var(--mm-id);border-radius:3px;color:var(--mm-ink)}
.mm-part:hover,.mm-part:focus-visible{border-color:var(--mm-accent);text-decoration:none}
.mm-rel{margin:0;padding:0;list-style:none}
.mm-rel li{display:flex;flex-wrap:wrap;gap:8px;align-items:baseline;padding:3px 0}
.mm-arrow{color:var(--mm-dim)}
.mm-quiet-text{color:var(--mm-dim);font-size:12px}
.mm-steps{position:sticky;bottom:0;display:flex;align-items:center;justify-content:space-between;margin-top:24px;
padding:12px 0 14px;border-top:1px solid var(--mm-line);background:var(--mm-fill)}
.mm-step{width:44px;height:32px;border:1px solid var(--mm-line);border-radius:4px;background:none;color:var(--mm-ink);
font:inherit;cursor:pointer}
.mm-step:hover:not(:disabled){border-color:var(--mm-accent)}
.mm-step:disabled{opacity:.3;cursor:default}
.mm-count-text{color:var(--mm-dim);font-size:12px}
@media (prefers-reduced-motion:reduce){.mm-block,.mm-block-head,.mm-block-sum{transition:none}}`.replace(/\n/g, "");
