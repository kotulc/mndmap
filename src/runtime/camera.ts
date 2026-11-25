/** The deck's camera: where it looks (a shot: a centre and a scale), how a box is fitted, and the
 *  flight from one shot to the next. A flight zooms evenly (scale moves in ratio, not in steps)
 *  and, between cards in different branches, rises through the box that holds them both, so the
 *  reader sees where they are going before they land. */

import type { Box } from "../render/blocks.js";


/** Where the camera looks: the world point at the viewport's centre, and the scale. */
export type Shot = { cx: number; cy: number; s: number };

/** The viewport's size. */
export type View = { w: number; h: number };

/** The most a card is magnified, and the room kept round a fitted box. */
const MOST = 1.35;
const ROOM = 28;


/** The shot that fits a box in the view. */
export function fit(box: Box, view: View): Shot {
  const s = Math.min((view.w - ROOM * 2) / box.w, (view.h - ROOM * 2) / box.h, MOST);
  return { cx: box.x + box.w / 2, cy: box.y + box.h / 2, s };
}

/** A shot as the world's CSS transform (its origin at the top left). */
export function transform(shot: Shot, view: View): string {
  return `translate(${view.w / 2 - shot.cx * shot.s}px, ${view.h / 2 - shot.cy * shot.s}px) scale(${shot.s})`;
}

/** The shot the world is showing now, read from its transform (mid-flight included). */
export function now(world: HTMLElement, view: View): Shot | null {
  const m = new DOMMatrixReadOnly(getComputedStyle(world).transform);
  if (!m.a) return null;
  return { cx: (view.w / 2 - m.e) / m.a, cy: (view.h / 2 - m.f) / m.a, s: m.a };
}

/** Fly the world from one shot to another, through `via` when given, in `ms`; resolves on landing.
 *  The path is sampled into keyframes: centre eased, scale eased in ratio. */
export function fly(world: HTMLElement, view: View, from: Shot, to: Shot, via: Shot | null, ms: number): Promise<void> {
  const legs = via ? [[from, via], [via, to]] as const : [[from, to]] as const;
  const frames: Keyframe[] = [];
  const steps = 18;
  legs.forEach(([a, b], leg) => {
    for (let i = leg ? 1 : 0; i <= steps; i++) {
      const t = ease(i / steps);
      const shot = { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, s: a.s * (b.s / a.s) ** t };
      frames.push({ transform: transform(shot, view), offset: (leg + i / steps) / legs.length });
    }
  });
  world.getAnimations().forEach((a) => a.cancel());
  world.style.transform = transform(to, view);
  if (ms <= 0) return Promise.resolve();
  const flight = world.animate(frames, { duration: via ? ms * 1.5 : ms, easing: "linear" });
  return flight.finished.then(() => undefined, () => undefined);
}

/** Ease in and out (cubic). */
function ease(t: number): number {
  return t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2;
}
