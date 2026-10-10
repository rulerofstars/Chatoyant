/** Matches a standard unicode emoji: flag pairs, single regional indicators, pictographs, keycaps. */
export const UNICODE_EMOJI_SOURCE =
  String.raw`\p{Regional_Indicator}\p{Regional_Indicator}|\p{Regional_Indicator}|\p{Extended_Pictographic}️?|[0-9#*]️?⃣`;

/** Identifier for an emoji, matching the `<a?:name:id>` / raw-unicode format used throughout these commands. */
export function emojiIdentifier(emoji: {
  id: string | null;
  name: string | null;
  animated?: boolean | null;
}): string {
  return emoji.id ? `<${emoji.animated ? "a" : ""}:${emoji.name}:${emoji.id}>` : (emoji.name ?? "");
}
