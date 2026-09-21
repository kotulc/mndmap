import { describe, expect, it } from "vitest";
import { generatedDescription, readingTimeMinutes, fillFrontmatter } from "../src/metadata.js";

describe("metadata fill", () => {
  it("generates description from first prose paragraph", () => {
    const text = "# Title\n\nFirst paragraph about the page.\n\n## Section\n\nMore.";
    expect(generatedDescription(text)).toBe("First paragraph about the page.");
  });

  it("computes reading time at 200 WPM with minimum one minute", () => {
    expect(readingTimeMinutes("one two three")).toBe(1);
    expect(readingTimeMinutes(new Array(250).fill("word").join(" "))).toBe(2);
  });

  it("fills missing description and reading_time only", () => {
    const input = "---\ntitle: Page\ndescription: Keep me\n---\n\nHello world.\n";
    const output = fillFrontmatter(input);
    expect(output).toContain("description: Keep me");
    expect(output).toContain("reading_time:");
    expect(output).not.toContain("description: Hello");
  });
});
