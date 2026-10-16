// Mention tokens in chat messages (trellis/12 D43): a person picked with `@` is sent
// as @[email](user:<id>), a team picked with `/` as /[Team name](team:<id>).
// The ids are hints for the assistant; the backend still checks what you may see.

export type MessagePart = string | { kind: "user" | "team"; label: string };

const TOKEN = /([@/])\[([^\]]+)\]\((user|team):[0-9a-fA-F-]{36}\)/g;

/** Text with mention tokens → plain text and chips, for showing a sent message. */
export function splitMentions(text: string): MessagePart[] {
  const parts: MessagePart[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ kind: match[3] as "user" | "team", label: match[1] + match[2] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

/** A picked person or team: what the box shows, and what is sent. */
export interface PickedMention {
  display: string; // "@riya@acme.com" or "/Team Alpha"
  token: string; // "@[riya@acme.com](user:<id>)"
  kind: "user" | "team";
}

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Box text → plain text and the picked mentions still in it, for coloring them while typing. */
export function markPicked(text: string, picked: PickedMention[]): MessagePart[] {
  if (picked.length === 0) return [text];
  const kinds = new Map(picked.map((m) => [m.display, m.kind]));
  // Longest first, as in withTokens; the capture group keeps the mentions in split()'s output
  const pattern = new RegExp(`(${[...kinds.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp).join("|")})`);
  return text
    .split(pattern)
    .filter(Boolean)
    .map((piece) => {
      const kind = kinds.get(piece);
      return kind ? { kind, label: piece } : piece;
    });
}

/** Box text → message text: each picked mention still in the text becomes its token. */
export function withTokens(text: string, picked: PickedMention[]): string {
  // Longest first, so "/Team Alpha 2" isn't half-replaced by "/Team Alpha"
  const sorted = [...picked].sort((a, b) => b.display.length - a.display.length);
  return sorted.reduce((out, m) => out.split(m.display).join(m.token), text);
}
