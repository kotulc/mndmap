/** What a table's cells read as: the form of each column, from what its cells hold. */

import type { Field } from "@mnd/kit";

/** What a whole value must be to read as a number, a flag or a link. */
const NUMBER = /^-?(\d{1,3}(,\d{3})+|\d+)(\.\d+)?%?$/;
const FLAG = /^(yes|no|true|false|y|n|x|✓)$/i;
const LINK = /^\[([^\]]*)\]\(([^)\s]+)\)$|^https?:\/\/\S+$/;

/** How many words a value may run to and still be one of a set, rather than prose. */
const SHORT = 3;


/** A column's form, from its filled cells: numbers, links or yes/no where every one agrees, a
 *  choice where short phrases repeat, and text otherwise. */
export function form_of(cells: string[]): Field["form"] {
  const filled = cells.map((cell) => cell.trim()).filter(Boolean);
  if (!filled.length) return "text";
  const forms = filled.map(value_form);
  const first = forms[0]!;
  if (!forms.every((form) => form === first)) return "text";
  const repeats = new Set(filled.map((cell) => cell.toLowerCase())).size < filled.length;
  return first === "choice" && !repeats ? "text" : first;
}


/** One value's form: a number, a flag, a link, a short phrase as one of a set, or text. */
function value_form(said: string): Field["form"] {
  if (NUMBER.test(said)) return "number";
  if (FLAG.test(said)) return "flag";
  if (LINK.test(said)) return "link";
  return said.split(/\s+/).length <= SHORT ? "choice" : "text";
}
