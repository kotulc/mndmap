/** Front matter, written and filled.
 *
 *  Fill-only: a value the author supplied is never overwritten, and only two
 *  keys are ever derived. Everything else on a page comes from its fields. */

import YAML from "yaml";


/** Plain-text word count, for reading time. */
export function plain_words(text: string): number {
  const stripped = text
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return stripped ? stripped.split(" ").filter(Boolean).length : 0;
}

/** Minutes at 200 words, never less than one. */
export function reading_time(text: string): number {
  return Math.max(1, Math.ceil(plain_words(text) / 200));
}

/** The first prose paragraph, normalised and capped. */
export function description_of(text: string, cap = 240): string | undefined {
  const body = text.replace(/<svg[\s\S]*?<\/svg>/gi, "").trim();
  for (const paragraph of body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean)) {
    if (/^#{1,6}\s/.test(paragraph) || paragraph.startsWith("|") || paragraph.startsWith("```")) continue;
    const line = paragraph
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
      .replace(/`([^`]*)`/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    return line.length <= cap ? line : `${line.slice(0, cap - 1).trimEnd()}…`;
  }
  return undefined;
}

/** The same front matter with the two derived keys added where the author
 *  left them out. */
export function fill(front: Record<string, unknown>, body: string): Record<string, unknown> {
  const out = { ...front };
  if (out.description === undefined || out.description === null || out.description === "") {
    const description = description_of(body) ?? (typeof out.title === "string" ? out.title : undefined);
    if (description) out.description = description;
  }
  if (out.reading_time === undefined || out.reading_time === null || out.reading_time === "") {
    out.reading_time = reading_time(body);
  }
  return out;
}

/** One document: front matter where there is any, then the body. */
export function write_frontmatter(front: Record<string, unknown>, body: string): string {
  const text = body.trimEnd();
  if (Object.keys(front).length === 0) return text ? `${text}\n` : "";
  return `---\n${YAML.stringify(front).trimEnd()}\n---\n\n${text}\n`;
}
