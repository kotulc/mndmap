/** The sidecar: what somebody might want to call a thing.
 *
 *  Taggly makes them and it is optional. Unset, there is no sidecar and
 *  everything else still works — nothing downstream may assume one exists.
 *  A suggestion is never graph data until somebody picks it. */

import { children, type Graph, type Id } from "@mnd/kit";
import { is_shipped, ITEM, LINK, PAGE, SECTION } from "./doc.js";
import type { Config, Suggestions } from "./types.js";

/** What goes over the wire, and what comes back. Named here so the endpoint
 *  is a contract rather than a shape guessed at the call site. */
interface Ask {
  count: number;
  blocks: { id: Id; name: string; body: string; kind: string }[];
  relations: { id: Id; from: string; to: string; type: string }[];
}


/** Candidates for everything in the graph worth naming. An unset endpoint
 *  is an empty sidecar, not an error. */
export async function suggest(graph: Graph, config: Config): Promise<Suggestions> {
  if (!config.suggest.taggly) return {};
  const response = await fetch(config.suggest.taggly, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(ask(graph, config.suggest.count)),
  });
  if (!response.ok) throw new Error(`taggly answered ${response.status}`);
  return trim(await response.json() as Suggestions, config.suggest.count);
}

/** What the endpoint is shown: everything a name means something for, with
 *  the body it carries. A cell and a run of prose are not named, so neither
 *  is sent — less content leaves the machine, and no chip appears where
 *  taking one would mean nothing. */
export function ask(graph: Graph, count: number): Ask {
  const blocks = Object.values(graph.blocks)
    .filter((block) => is_shipped(block.type) && block.type !== ITEM)
    .map((block) => ({
      id: block.id,
      name: block.name ?? "",
      body: block.body ?? "",
      kind: block.type ?? "",
    }));

  const relations = Object.values(graph.edges).map((relation) => ({
    id: relation.id,
    from: graph.blocks[relation.from]?.name ?? relation.from,
    to: graph.blocks[relation.to]?.name ?? relation.to,
    type: relation.type ?? LINK,
  }));

  return { count, blocks, relations };
}

/** The sidecar, capped and stripped of anything the graph does not hold. */
export function trim(raw: Suggestions, count: number): Suggestions {
  const out: Suggestions = {};
  for (const [id, entry] of Object.entries(raw ?? {})) {
    const held: Suggestions[string] = {};
    for (const of of ["name", "tags", "group", "type"] as const) {
      const values = entry?.[of];
      if (Array.isArray(values) && values.length) held[of] = values.slice(0, count).map(String);
    }
    if (Object.keys(held).length) out[id] = held;
  }
  return out;
}

/** Which blocks the tray offers chips for: the ones a gesture may name. */
export function offered(graph: Graph, layer: Id): Id[] {
  return children(graph, layer)
    .filter((block) => block.type === PAGE || block.type === SECTION)
    .map((block) => block.id);
}
