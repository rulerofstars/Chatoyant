import {
  ApplicationCommandType,
  ComponentType,
  ContextMenuCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputStyle,
  type GuildTextBasedChannel,
  type MessageContextMenuCommandInteraction,
} from "discord.js";

/**
 * Translates raw message content into an ordered sequence of emoji identifiers and user IDs.
 * Custom emoji are returned as `<:name:id>` / `<a:name:id>`.
 * Unicode emoji are returned as the raw character(s).
 * Mentions are returned as the bare user ID.
 */
function tokenize(content: string) {
  type Token = { type: "emoji"; value: string } | { type: "mention"; userId: string };
  const tokens: Token[] = [];

  // Order: custom emoji | mention | flag pairs | single regional indicators | standard emoji | keycaps
  const re =
    /(<a?:\w+:\d+>)|(<@!?(\d+)>)|(\p{Regional_Indicator}\p{Regional_Indicator}|\p{Regional_Indicator}|\p{Extended_Pictographic}️?|[0-9#*]️?⃣)/gu;

  for (const m of content.matchAll(re)) {
    if (m[1]) tokens.push({ type: "emoji", value: m[1] });
    else if (m[3]) tokens.push({ type: "mention", userId: m[3] });
    else if (m[4]) tokens.push({ type: "emoji", value: m[4] });
  }

  return tokens;
}

/**
 * Groups user IDs under their preceding emoji, preserving insertion order.
 * Mentions that appear before any emoji are ignored.
 */
function groupByEmoji(tokens: ReturnType<typeof tokenize>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let current: string | null = null;

  for (const token of tokens) {
    if (token.type === "emoji") {
      current = token.value;
      if (!groups.has(current)) groups.set(current, []);
    } else if (current) {
      const group = groups.get(current)!;
      if (!group.includes(token.userId)) group.push(token.userId);
    }
  }

  return groups;
}

/**
 * Message context menu command: right-click a message -> Apps -> Ping Selected.
 *
 * Parses emoji→mention associations from the target message (regardless of how they're
 * formatted), shows a modal for an optional custom message, then posts a clean ping:
 *
 *   emoji: @mention1 @mention2
 *   emoji2: @mention3
 *   [custom message]
 *
 * Posts into the message's thread if one exists, otherwise into the same channel.
 * Only the original message author can trigger this.
 */
export default {
  data: new ContextMenuCommandBuilder()
    .setName("Ping Selected")
    .setType(ApplicationCommandType.Message),

  async execute(interaction: MessageContextMenuCommandInteraction) {
    const message = interaction.targetMessage;

    if (interaction.user.id !== message.author.id) {
      await interaction.reply({ content: "Only the original poster can use this.", flags: MessageFlags.Ephemeral });
      return;
    }

    const groups = groupByEmoji(tokenize(message.content));
    const populated = [...groups.entries()].filter(([, ids]) => ids.length > 0);

    if (populated.length === 0) {
      await interaction.reply({ content: "No emoji : mention pairs found in that message.", flags: MessageFlags.Ephemeral });
      return;
    }

    await interaction.showModal(
      new ModalBuilder({
        custom_id: "ping-selected",
        title: "Ping Selected",
        components: [{
          type: ComponentType.ActionRow,
          components: [{
            type: ComponentType.TextInput,
            custom_id: "custom-message",
            label: "Custom message (optional)",
            style: TextInputStyle.Short,
            required: false,
            max_length: 500,
          }],
        }],
      }),
    );

    let submitted;
    try {
      submitted = await interaction.awaitModalSubmit({
        time: 60_000,
        filter: (i) => i.user.id === interaction.user.id,
      });
    } catch {
      return;
    }

    const custom = submitted.fields.getTextInputValue("custom-message").trim();
    const lines = populated.map(([emoji, ids]) => `${emoji}: ${ids.map((id) => `<@${id}>`).join(" ")}`);
    const content = lines.join("\n") + (custom ? `\n${custom}` : "");

    const destination = message.hasThread && message.thread
      ? message.thread
      : message.channel as GuildTextBasedChannel;

    await destination.send(content);
    await submitted.reply({ content: "Pinged.", flags: MessageFlags.Ephemeral });
  },
};
