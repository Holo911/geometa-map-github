/** Convert an ISO-3166-1 alpha-2 code to a regional-indicator flag emoji. */
export function flagEmoji(a2: string | null | undefined): string | null {
  if (!a2 || !/^[A-Za-z]{2}$/.test(a2)) return null;
  const cc = a2.toUpperCase();
  const cp = [...cc].map((c) => 0x1f1e6 + (c.charCodeAt(0) - 65));
  return String.fromCodePoint(...cp);
}
