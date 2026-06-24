import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  MessageFlags,
  type MessageContextMenuCommandInteraction,
} from "discord.js";

/**
 * Extracts all unique emoji identifiers from a Discord message string.
 *
 * Returns strings in the format expected by `Message.react()`:
 * - Custom emoji: `"name:id"` (e.g. `"pepega:123456789"`)
 * - Unicode emoji: the raw characters (e.g. `"⚔️"`, `"🇦"`, `"1️⃣"`)
 */
function extractEmojis(content: string): string[] {
  const seen = new Set<string>();
  const results: string[] = [];

  for (const match of content.matchAll(/<a?:(\w+):(\d+)>/g)) {
    const key = `${match[1]}:${match[2]}`;
    if (!seen.has(key)) {
      seen.add(key);
      results.push(key);
    }
  }

  // flag pairs | single regional indicators (🇦) | standard emoji (⚔️) | keycaps (1️⃣)
  const unicodeEmojiRegex =
    /\p{Regional_Indicator}\p{Regional_Indicator}|\p{Regional_Indicator}|\p{Extended_Pictographic}️?|[0-9#*]️?⃣/gu;

  for (const match of content.matchAll(unicodeEmojiRegex)) {
    const emoji = match[0];
    if (!seen.has(emoji)) {
      seen.add(emoji);
      results.push(emoji);
    }
  }

  return results;
}

/**
 * Message context menu command: right-click a message -> Apps -> Seed Reactions.
 *
 * Scans the target message for emoji and reacts with each one the bot hasn't already
 * reacted with.
 *
 * Requires ADD_REACTIONS.
 * Emoji the bot can't react with (missing permission, unavailable) are silently skipped.
 */
export default {
  data: new ContextMenuCommandBuilder()
    .setName("Seed Reactions")
    .setType(ApplicationCommandType.Message),

  async execute(interaction: MessageContextMenuCommandInteraction) {
    const message = interaction.targetMessage;
    const emojis = extractEmojis(message.content);

    if (emojis.length === 0) {
      await interaction.reply({
        content: "No emojis found in that message.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    const botId = interaction.client.user.id;
    const alreadyReacted = new Set(
      message.reactions.cache
        .filter((r) => r.users.cache.has(botId))
        .map((r) => (r.emoji.id ? `${r.emoji.name}:${r.emoji.id}` : (r.emoji.name ?? ""))),
    );

    const toSeed = emojis.filter((e) => !alreadyReacted.has(e));

    if (toSeed.length === 0) {
      await interaction.reply({
        content: "Already reacted with all emojis in that message.",
        flags: MessageFlags.Ephemeral,
      });
      return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    let seeded = 0;
    for (const emoji of toSeed) {
      try {
        await message.react(emoji);
        seeded++;
      } catch {
        // skip emoji unavailable or missing permission
      }
    }

    await interaction.editReply(`Seeded ${seeded} reaction${seeded === 1 ? "" : "s"}.`);
  },
};
