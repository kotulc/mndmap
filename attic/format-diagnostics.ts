import type { Diagnostic } from "../types.js";

export function formatDiagnosticsForDisplay(diagnostics: Diagnostic[]): string {
  const errors = diagnostics.filter((entry) => entry.severity === "error");
  if (errors.length === 0) return "";

  const groups = new Map<string, Diagnostic[]>();
  for (const entry of errors) {
    const bucket = groups.get(entry.code) ?? [];
    bucket.push(entry);
    groups.set(entry.code, bucket);
  }

  const sections: string[] = [];

  const missing = groups.get("missing-source-node") ?? [];
  if (missing.length > 0) {
    groups.delete("missing-source-node");
    if (missing.length === 1) {
      sections.push(missing[0]!.message);
    } else {
      sections.push(
        `${missing.length} items from your saved layout are no longer in docs/. Delete .mndmap/ and restart to reseed from the current tree, or restore the missing content and rescan:`,
      );
      for (const entry of missing.slice(0, 8)) sections.push(`  • ${entry.message}`);
      if (missing.length > 8) sections.push(`  … and ${missing.length - 8} more`);
    }
  }

  for (const entry of groups.get("ambiguous-identity") ?? []) sections.push(entry.message);
  groups.delete("ambiguous-identity");

  for (const entries of groups.values()) {
    for (const entry of entries) sections.push(entry.message);
  }

  return sections.join("\n");
}
