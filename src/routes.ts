/** Paths, slugs and anchors.
 *
 *  One place decides what an emitted file is called and what a link to it
 *  looks like, so the reader, the emitter and the nav order cannot disagree. */

/** An mdsite page URL from an emitted relative path. */
export function route(path: string): string {
  const parts = path.replaceAll("\\", "/").split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  const base = parts[parts.length - 1]!.replace(/\.(md|mdx)$/i, "");
  const dir = parts.slice(0, -1);
  const segments = base === "index" ? dir : [...dir, base];
  return segments.length === 0 ? "/" : `/${segments.join("/")}`;
}

/** A heading anchor, GitHub style. */
export function anchor(name: string): string {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/** A directory or file segment from a name somebody typed. */
export function slug(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

/** A full link target: the page, and a heading within it. */
export function link_to(path: string, heading?: string): string {
  return heading ? `${route(path)}#${anchor(heading)}` : route(path);
}

/** A source-relative target resolved against the document that names it.
 *  Null where it escapes the source root, which is a refusal. */
export function resolve(from: string, target: string): string | null {
  if (!target || target.startsWith("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) return null;
  const base = from.replaceAll("\\", "/").split("/").slice(0, -1);
  const parts = [...base, ...target.split("/")];
  const out: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (out.length === 0) return null;
      out.pop();
      continue;
    }
    out.push(part);
  }
  return out.join("/");
}

/** Whether a target names a place rather than a file to fetch. */
export function is_external(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//") || target.startsWith("#");
}

export function is_markdown(path: string): boolean {
  return /\.(md|mdx)$/i.test(path);
}

export function dir_of(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? "" : path.slice(0, at);
}

export function base_of(path: string): string {
  const at = path.lastIndexOf("/");
  return at < 0 ? path : path.slice(at + 1);
}

/** A path relative to a directory, as a link may be written. */
export function relative_to(from_dir: string, path: string): string {
  const here = from_dir ? from_dir.split("/") : [];
  const there = path.split("/");
  let same = 0;
  while (same < here.length && same < there.length - 1 && here[same] === there[same]) same++;
  const up = here.slice(same).map(() => "..");
  const down = there.slice(same);
  const out = [...up, ...down].join("/");
  return out.startsWith(".") ? out : `./${out}`;
}
