import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "../lib/html-entities";

describe("decodeHtmlEntities", () => {
  it("decodes the numeric apostrophe entity (matches the TDSB upstream)", () => {
    expect(decodeHtmlEntities("70 D&#39;Arcy Street")).toBe("70 D'Arcy Street");
    expect(decodeHtmlEntities("1665 O&#39;Connor Drive")).toBe("1665 O'Connor Drive");
  });

  it("decodes hex numeric entities", () => {
    expect(decodeHtmlEntities("D&#x27;Arcy")).toBe("D'Arcy");
    expect(decodeHtmlEntities("D&#X27;Arcy")).toBe("D'Arcy");
  });

  it("decodes common named entities", () => {
    expect(decodeHtmlEntities("Smith &amp; Co")).toBe("Smith & Co");
    expect(decodeHtmlEntities("&quot;quoted&quot;")).toBe('"quoted"');
    expect(decodeHtmlEntities("D&apos;Arcy")).toBe("D'Arcy");
    expect(decodeHtmlEntities("a &lt; b &gt; c")).toBe("a < b > c");
    expect(decodeHtmlEntities("a&nbsp;b")).toBe("a b");
  });

  it("passes through strings without entities", () => {
    expect(decodeHtmlEntities("70 Princess Anne Crescent")).toBe("70 Princess Anne Crescent");
  });

  it("handles null/undefined/empty", () => {
    expect(decodeHtmlEntities(undefined)).toBeUndefined();
    expect(decodeHtmlEntities(null)).toBeNull();
    expect(decodeHtmlEntities("")).toBe("");
  });

  it("leaves unrecognised entities untouched", () => {
    expect(decodeHtmlEntities("&unknown;")).toBe("&unknown;");
  });
});
