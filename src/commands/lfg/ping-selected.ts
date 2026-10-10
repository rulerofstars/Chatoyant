import {
  ApplicationCommandType,
  ComponentType,
  ContextMenuCommandBuilder,
  MessageFlags,
  ModalBuilder,
  TextInputStyle,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { UNICODE_EMOJI_SOURCE } from "./emoji.ts";
import { formatPingLine, resolveDestination } from "./ping.ts";
import { requireOriginalPoster } from "./permissions.ts";

/**
 * Translates raw message content into an ordered sequence of emoji identifiers, user IDs,
 * and plain text words.
 * Custom emoji are returned as `<:name:id>` / `<a:name:id>`.
 * Unicode emoji are returned as the raw character(s).
 * Mentions are returned as the bare user ID.
 */
function tokenize(content: string) {
  type Token =
    | { type: "emoji"; value: string }
    | { type: "mention"; userId: string }
    | { type: "text"; value: string };
  const tokens: Token[] = [];

  // Order: custom emoji | mention | unicode emoji | word
  const re = new RegExp(String.raw`(<a?:\w+:\d+>)|(<@!?(\d+)>)|(${UNICODE_EMOJI_SOURCE})|(\S+)`, "gu");

  for (const m of content.matchAll(re)) {
    if (m[1]) tokens.push({ type: "emoji", value: m[1] });
    else if (m[3]) tokens.push({ type: "mention", userId: m[3] });
    else if (m[4]) tokens.push({ type: "emoji", value: m[4] });
    else if (m[5]) tokens.push({ type: "text", value: m[5] });
  }

  return tokens;
}

/** True for separators ("/", "|", "-" etc) */
function isSeparator(value: string) {
  return /^[-/|,;:]+$/.test(value);
}

/**
 * Groups a label and user IDs under their preceding emoji, preserving insertion order.
 * Mentions that appear before any emoji are ignored.
 */
function groupByEmoji(tokens: ReturnType<typeof tokenize>): Map<string, { label: string; ids: string[] }> {
  const groups = new Map<string, { label: string; ids: string[] }>();
  let current: string | null = null;
  let labelLocked = false;

  for (const token of tokens) {
    if (token.type === "emoji") {
      current = token.value;
      labelLocked = false;
      if (!groups.has(current)) groups.set(current, { label: "", ids: [] });
    } else if (token.type === "mention") {
      if (!current) continue;
      labelLocked = true;
      const group = groups.get(current)!;
      if (!group.ids.includes(token.userId)) group.ids.push(token.userId);
    } else if (current && !labelLocked && !isSeparator(token.value)) {
      const group = groups.get(current)!;
      group.label = group.label ? `${group.label} ${token.value}` : token.value;
    }
  }

  return groups;
}

/**
 * Message context menu command: right-click a message -> Apps -> Ping Selected.
 *
 * Parses emoji->label->mention associations from the target message (regardless of how
 * they're formatted), shows a modal for an optional custom message, then posts a clean ping:
 *
 *   emoji `label`: @mention1 @mention2
 *   emoji2 `label2`: @mention3
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

    if (!(await requireOriginalPoster(interaction, message))) return;

    const groups = groupByEmoji(tokenize(message.content));
    const populated = [...groups.entries()].filter(([, group]) => group.ids.length > 0);

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
    const lines = populated.map(([emoji, { label, ids }]) => formatPingLine(emoji, label, ids));
    const content = lines.join("\n") + (custom ? `\n${custom}` : "");

    await resolveDestination(message).send(content);
    await submitted.reply({ content: "Pinged.", flags: MessageFlags.Ephemeral });
  },
};
