/** The script on every diagram page: the theme, then what its kind of diagram does. In a frame,
 *  links leave the frame for the host page. */

import { deck } from "./deck.js";
import { flow } from "./flow.js";
import { map, type MapState } from "./map.js";
import { setup } from "./theme.js";


setup();
if (document.documentElement.classList.contains("mm-embedded")) {
  document.head.appendChild(Object.assign(document.createElement("base"), { target: "_top" }));
}

const data = JSON.parse(document.getElementById("mm-data")?.textContent ?? "{}");
const stage = document.querySelector<HTMLElement>(".mm-stage");
if (stage && data.kind === "map") map(stage, data as MapState);
if (stage && data.kind === "flow") flow(stage);
const decked = document.querySelector<HTMLElement>(".mm-deck");
if (decked && data.kind === "deck") deck(decked, data.deck);
