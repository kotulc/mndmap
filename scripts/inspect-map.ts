/** Temporary inspection of org vs page content. */
import { writeFileSync, readFileSync } from "node:fs";
import { open, children } from "@mnd/kit";
import { PAGE, SECTION } from "../src/doc.js";
import { organizationGraph, documentOutline } from "../src/ui/project.js";

const g = open(readFileSync("fixtures/map/workspace.json", "utf8")).graph;
const org = organizationGraph(g);
const lines: string[] = [];
lines.push(`ORG ${Object.keys(org.blocks).length}`);
for (const b of Object.values(org.blocks)) {
  lines.push(["org", b.type, b.id, b.name ?? ""].join("\t"));
}

const page = Object.values(g.blocks).find((b) => b.type === PAGE && String(b.id).includes("index"));
lines.push(`PAGE ${page?.id}`);

function dump(id: string, depth = 0): void {
  for (const h of Object.values(g.holders).filter((held) => held.parent === id)) {
    lines.push(`${"  ".repeat(depth)}HOLDER ${h.arrangement} ${h.id} order=${h.order}`);
  }
  for (const c of children(g, id)) {
    const lv = c.fields?.find((f) => f.name === "level")?.value;
    lines.push(
      `${"  ".repeat(depth)}${[c.type, c.name ?? "", lv ? `L${lv}` : "", `ord${c.order}`, c.group ?? ""].join(" | ")}`,
    );
    if (c.type === SECTION) dump(c.id, depth + 1);
  }
}

if (page) {
  dump(page.id);
  lines.push("OUTLINE");
  for (const row of documentOutline(g, page.id)) {
    const label =
      row.kind === "section" ? row.title
      : row.kind === "prose" ? row.markdown.slice(0, 60)
      : row.kind === "table" ? `table ${row.headers.join(",")}`
      : row.kind === "list" ? `list(${row.items.length})`
      : row.kind === "code" ? `code ${row.language ?? ""}`
      : row.id;
    lines.push(`${"  ".repeat(row.depth)}${row.kind} ${label}`);
  }
}

writeFileSync("tmp-inspect.txt", lines.join("\n"));
console.log("wrote tmp-inspect.txt", lines.length, "lines");
