/** The theme toggle, as mndsite's: one button cycling system → light → dark, stored under the same
 *  key, so a diagram page and the site it belongs to keep one choice. Unchosen, a page is dark. In
 *  a frame the page follows its host instead, and shows no toggle. */

import { ICONS } from "../render/icons.js";


type Choice = keyof typeof ICONS;

const CYCLE: Choice[] = ["system", "light", "dark"];
const KEY = "theme";
const root = document.documentElement;
const system = matchMedia("(prefers-color-scheme: dark)");


/** The stored choice, or dark. */
function chosen(): Choice {
  let stored: string | null = null;
  try { stored = localStorage.getItem(KEY); } catch { /* storage blocked: stay dark */ }
  return CYCLE.includes(stored as Choice) ? stored as Choice : "dark";
}

/** Set the page dark or light. */
function show(dark: boolean) {
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
}

/** Apply a choice, resolving `system` from the reader's setting. */
function apply(choice: Choice) {
  show(choice === "dark" || (choice === "system" && system.matches));
}

/** Follow the host page's `dark` / `light` class, where the frame may read it. */
function mirror() {
  try {
    const host = parent.document.documentElement;
    const sync = () => show(host.classList.contains("dark") || (!host.classList.contains("light") && system.matches));
    new MutationObserver(sync).observe(host, { attributes: true, attributeFilter: ["class"] });
    sync();
  } catch { /* another origin: keep what the boot script set */ }
}

/** Wire the toggle, or follow the host when framed. */
export function setup() {
  if (root.classList.contains("mm-embedded")) return mirror();
  const button = document.querySelector<HTMLButtonElement>("[data-theme-toggle]");
  const draw = () => {
    const now = chosen();
    const next = CYCLE[(CYCLE.indexOf(now) + 1) % CYCLE.length]!;
    if (!button) return;
    button.querySelector("svg")!.innerHTML = ICONS[now];
    button.title = `Current: ${now} — click for ${next}`;
    button.setAttribute("aria-label", `Switch to ${next} theme`);
  };
  button?.addEventListener("click", () => {
    const next = CYCLE[(CYCLE.indexOf(chosen()) + 1) % CYCLE.length]!;
    try { localStorage.setItem(KEY, next); } catch { /* unsaved */ }
    apply(next);
    draw();
  });
  addEventListener("storage", (e) => { if (e.key === KEY) { apply(chosen()); draw(); } });
  system.addEventListener("change", () => apply(chosen()));
  apply(chosen());
  draw();
}
