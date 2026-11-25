/** A flow on its own page: hovering a node lights its routes and neighbours and quiets the rest;
 *  "Actual size" shows the drawing unscaled, scrolling, for flows wider than the page. */


/** Wire the flow drawn in `stage`. */
export function flow(stage: HTMLElement) {
  const nodes = [...stage.querySelectorAll<SVGGElement>(".mm-node")];
  const routes = [...stage.querySelectorAll<SVGPathElement>(".mm-route")];

  const light = (id?: string) => {
    const near = new Set(id ? [id] : []);
    for (const r of routes) {
      const on = !!id && (r.dataset.from === id || r.dataset.to === id);
      if (on) { near.add(r.dataset.from!); near.add(r.dataset.to!); }
      r.classList.toggle("mm-lit", on);
      r.classList.toggle("mm-dim", !!id && !on);
    }
    for (const n of nodes) {
      n.classList.toggle("mm-lit", !!id && near.has(n.dataset.id!));
      n.classList.toggle("mm-dim", !!id && !near.has(n.dataset.id!));
    }
  };
  for (const n of nodes) {
    n.addEventListener("mouseenter", () => light(n.dataset.id));
    n.addEventListener("mouseleave", () => light());
  }

  const actual = document.querySelector<HTMLButtonElement>("[data-actual]");
  actual?.addEventListener("click", () => {
    const on = stage.classList.toggle("mm-actual");
    actual.setAttribute("aria-pressed", String(on));
  });
}
