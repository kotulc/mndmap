import type { GroupingSuggester, GroupingSuggestion, OrganizationSnapshot } from "./types.js";

/** Optional taggly integration surface — implementation deferred. */
export type { GroupingSuggester, GroupingSuggestion, OrganizationSnapshot };

export const noopSuggester: GroupingSuggester = {
  async suggest(): Promise<GroupingSuggestion[]> {
    return [];
  },
};
