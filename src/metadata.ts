import YAML from "yaml";

/** Plain-text word count for reading-time calculation. */
export function plainTextWords(content: string): number {
  const stripped = content
    .replace(/^---[\s\S]*?---/m, "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/^#{1,6}\s+/gm, " ")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!stripped) return 0;
  return stripped.split(" ").filter(Boolean).length;
}

/** Reading time in minutes at 200 WPM, minimum one minute. */
export function readingTimeMinutes(content: string): number {
  return Math.max(1, Math.ceil(plainTextWords(content) / 200));
}

/** First non-heading prose paragraph, normalized and length-capped. */
export function generatedDescription(content: string, maxLength = 240): string | undefined {
  const body = content.replace(/^---[\s\S]*?---/m, "").replace(/<svg[\s\S]*?<\/svg>/gi, "").trim();
  const paragraphs = body.split(/\n{2,}/).map((part) => part.trim()).filter(Boolean);
  for (const paragraph of paragraphs) {
    if (/^#{1,6}\s/.test(paragraph)) continue;
    const line = paragraph
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[[^\]]*\]\([^)]*\)/g, "$1")
      .replace(/`[^`]*`/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!line) continue;
    if (line.length <= maxLength) return line;
    return `${line.slice(0, maxLength - 1).trimEnd()}…`;
  }
  return undefined;
}

export function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return { frontmatter: {}, body: content };
  const parsed = YAML.parse(match[1] ?? "");
  return {
    frontmatter: parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : {},
    body: content.slice(match[0].length),
  };
}

export function serializeFrontmatter(frontmatter: Record<string, unknown>, body: string): string {
  if (Object.keys(frontmatter).length === 0) return body;
  return `---\n${YAML.stringify(frontmatter).trimEnd()}\n---\n${body.startsWith("\n") ? body : `\n${body}`}`;
}

/** Fill missing description and reading_time without overwriting supplied values. */
export function fillFrontmatter(content: string, proseForMetadata?: string): string {
  const { frontmatter, body } = parseFrontmatter(content);
  const prose = proseForMetadata ?? body;
  if (frontmatter.description === undefined || frontmatter.description === null || frontmatter.description === "") {
    const description = generatedDescription(prose) ?? (typeof frontmatter.title === "string" ? frontmatter.title : undefined);
    if (description) frontmatter.description = description;
  }
  if (frontmatter.reading_time === undefined || frontmatter.reading_time === null || frontmatter.reading_time === "") {
    frontmatter.reading_time = readingTimeMinutes(prose);
  }
  return serializeFrontmatter(frontmatter, body);
}
