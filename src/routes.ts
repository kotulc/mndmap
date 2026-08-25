import { dirname, extname, relative, sep } from "node:path";

/** mdsite-compatible page URL from an emitted relative path. */
export function pageRoute(emitPath: string): string {
  const normalized = emitPath.replaceAll("\\", "/");
  const parts = normalized.split("/").filter(Boolean);
  if (parts.length === 0) return "/";
  const last = parts[parts.length - 1]!;
  const base = last.replace(/\.(md|mdx)$/i, "");
  const dir = parts.slice(0, -1);
  const slugParts = base === "index" ? dir : [...dir, base];
  return slugParts.length === 0 ? "/" : `/${slugParts.join("/")}`;
}

/** mdsite-compatible heading anchor (Nextra/GitHub style). */
export function sectionAnchor(name: string): string {
  return String(name || "")
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
}

/** Full emitted link target for a page and optional heading. */
export function sourceLink(emitPath: string, heading?: string): string {
  const route = pageRoute(emitPath);
  return heading ? `${route}#${sectionAnchor(heading)}` : route;
}

/** Output path segment from a title or explicit slug. */
export function slugifySegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/^-+|-+$/g, "") || "untitled";
}

/** Default emitted file path for a page under a directory prefix. */
export function defaultPagePath(dirPrefix: string, title: string, extension: ".md" | ".mdx" = ".md"): string {
  const dir = dirPrefix ? `${dirPrefix.replace(/\/$/, "")}/` : "";
  return `${dir}${slugifySegment(title)}${extension}`;
}

/** Relative asset path under _assets/ preserving docs-relative structure. */
export function assetOutputPath(docsRelative: string): string {
  return `_assets/${docsRelative.replaceAll("\\", "/")}`;
}

/** Resolve a relative link target from a source document path. */
export function resolveRelativeTarget(fromDoc: string, target: string): string | null {
  if (!target || target.startsWith("#")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return null;
  const hashIndex = target.indexOf("#");
  const pathPart = hashIndex >= 0 ? target.slice(0, hashIndex) : target;
  if (!pathPart) return fromDoc.replaceAll("\\", "/");
  const base = dirname(fromDoc.replaceAll("\\", "/"));
  const joined = relative("", `${base}/${pathPart}`.replace(/\/+/g, "/")).replaceAll(sep, "/");
  return joined.startsWith("..") ? null : joined;
}
