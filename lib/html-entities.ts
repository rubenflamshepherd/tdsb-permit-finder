const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
};

const ENTITY_RE = /&(#(?:x[0-9a-f]+|[0-9]+)|[a-z]+);/gi;

export function decodeHtmlEntities<T extends string | null | undefined>(input: T): T {
  if (input == null || input === "") return input;
  return (input as string).replace(ENTITY_RE, (match, body: string) => {
    if (body[0] === "#") {
      const codePoint = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    const named = NAMED[body.toLowerCase()];
    return named ?? match;
  }) as T;
}
