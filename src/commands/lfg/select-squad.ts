import {
  ActionRowBuilder,
  ApplicationCommandType,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  StringSelectMenuBuilder,
  type GuildMember,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { emojiIdentifier, UNICODE_EMOJI_SOURCE } from "./emoji.ts";
import { formatPingLine, resolveDestination } from "./ping.ts";
import { requireOriginalPoster } from "./permissions.ts";

/**
 * Extracts the label text following each emoji in the
 * message content (e.g. "dps" in ":emotedps: dps"). Labels are scoped per line so multiple
 * emoji on one line each get their own trailing text.
 */
function extractEmojiLabels(content: string): Map<string, string> {
  const labels = new Map<string, string>();
  const emojiRe = new RegExp(String.raw`(<a?:\w+:\d+>)|(${UNICODE_EMOJI_SOURCE})`, "gu");

  const mentionRe = /<@!?\d+>/;

  for (const line of content.split("\n")) {
    const matches = [...line.matchAll(emojiRe)];
    for (let i = 0; i < matches.length; i++) {
      const m = matches[i];
      const emoji = (m[1] ?? m[2])!;
      const start = m.index! + m[0].length;
      let end = matches[i + 1]?.index ?? line.length;

      // Don't let a manually-typed mention (e.g. from a previously-posted ping) bleed into the label.
      const mentionMatch = line.slice(start, end).match(mentionRe);
      if (mentionMatch) end = start + mentionMatch.index!;

      const label = line
        .slice(start, end)
        .replace(/^[\s\-/|,;:]+|[\s\-/|,;:]+$/g, "")
        .trim();

      if (!labels.has(emoji)) labels.set(emoji, label);
      else if (!labels.get(emoji) && label) labels.set(emoji, label);
    }
  }

  return labels;
}

const MAX_OPTIONS = 25;

type RolePage = { emoji: string; label: string; reactors: GuildMember[] };

/**
 * Message context menu command: right-click a message -> Apps -> Select Squad.
 *
 * Reads the target message's reactions (one per role) and opens a page per role
 * each with a dropdown limited to that role's reactors. Submitting
 * posts a ping listing the chosen people per role, same format as Ping Selected.
 *
 * Posts into the message's thread if one exists, otherwise into the same channel.
 * Only the original message author can trigger this.
 */
export default {
  data: new ContextMenuCommandBuilder()
    .setName("Select Squad")
    .setType(ApplicationCommandType.Message),

  async execute(interaction: MessageContextMenuCommandInteraction) {
    const message = interaction.targetMessage;

    if (!(await requireOriginalPoster(interaction, message))) return;

    const labels = extractEmojiLabels(message.content);

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const guild = message.guild!;
    const roleData = new Map<string, { label: string; reactors: GuildMember[] }>();

    for (const reaction of message.reactions.cache.values()) {
      const emoji = emojiIdentifier(reaction.emoji);
      const users = await reaction.users.fetch();
      const ids = [...users.values()].filter((u) => !u.bot).map((u) => u.id);
      if (ids.length === 0) continue;

      const members = await guild.members.fetch({ user: ids });
      const reactors = [...members.values()];
      if (reactors.length === 0) continue;

      roleData.set(emoji, { label: labels.get(emoji) ?? "", reactors });
    }

    if (roleData.size === 0) {
      await interaction.editReply("No reactions to select from on that message.");
      return;
    }

    const orderedEmojis = [
      ...[...labels.keys()].filter((e) => roleData.has(e)),
      ...[...roleData.keys()].filter((e) => !labels.has(e)).sort(),
    ];
    const pages: RolePage[] = orderedEmojis.map((emoji) => ({ emoji, ...roleData.get(emoji)! }));

    const selections = new Map<string, Set<string>>(pages.map((p) => [p.emoji, new Set<string>()]));
    const nameById = new Map<string, string>();
    for (const p of pages) for (const m of p.reactors) nameById.set(m.id, m.displayName);
    let page = 0;

    const roleLabel = (p: RolePage) => (p.label ? `${p.emoji} ${p.label}` : p.emoji);
    const namesFor = (emoji: string) => [...selections.get(emoji)!].map((id) => nameById.get(id) ?? id);

    const build = () => {
      const current = pages[page];

      const embed = new EmbedBuilder()
        .setTitle("Select Squad")
        .setDescription(`Role ${page + 1}/${pages.length}`)
        .addFields(
          pages.map((p) => {
            const names = namesFor(p.emoji);
            return {
              name: p === current ? `▶ **${roleLabel(p)}**` : `• ${roleLabel(p)}`,
              value: `Reacted: ${p.reactors.length} — Selected: ${names.length ? names.join(", ") : "*none yet*"}`,
              inline: false,
            };
          }),
        );

      const allReacted = [...nameById.values()];
      embed.addFields({
        name: `Users reacted: ${allReacted.length}`,
        value: allReacted.length ? allReacted.join(", ") : "*none*",
        inline: false,
      });

      const allSelected = [...new Set([...selections.values()].flatMap((s) => [...s]))].map(
        (id) => nameById.get(id) ?? id,
      );
      embed.addFields({
        name: `Users selected: ${allSelected.length}`,
        value: allSelected.length ? allSelected.join(", ") : "*none yet*",
        inline: false,
      });

      const selectedIds = selections.get(current.emoji)!;
      const truncated = current.reactors.slice(0, MAX_OPTIONS);
      const select = new StringSelectMenuBuilder()
        .setCustomId("role-select")
        .setPlaceholder(`Select: ${current.emoji} ${current.label || ""}`)
        .setMinValues(0)
        .setMaxValues(truncated.length)
        .addOptions(
          truncated.map((u) => ({
            label: u.displayName.slice(0, 100),
            value: u.id,
            default: selectedIds.has(u.id),
          })),
        );

      const nav = new ActionRowBuilder<ButtonBuilder>().addComponents(
        new ButtonBuilder()
          .setCustomId("prev")
          .setLabel("◀ Prev")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === 0),
        new ButtonBuilder()
          .setCustomId("next")
          .setLabel("Next ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(page === pages.length - 1),
        new ButtonBuilder().setCustomId("submit").setLabel("Submit").setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId("cancel").setLabel("Cancel").setStyle(ButtonStyle.Danger),
      );

      return {
        embeds: [embed],
        components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select), nav],
      };
    };

    const reply = await interaction.editReply(build());

    const collector = reply.createMessageComponentCollector({
      filter: (i) => i.user.id === interaction.user.id,
      time: 10 * 60_000,
    });

    collector.on("collect", async (i) => {
      if (i.componentType === ComponentType.StringSelect) {
        selections.set(pages[page].emoji, new Set(i.values));
        await i.update(build());
        return;
      }

      if (i.customId === "prev") {
        page--;
        await i.update(build());
      } else if (i.customId === "next") {
        page++;
        await i.update(build());
      } else if (i.customId === "cancel") {
        collector.stop("cancelled");
        await i.update({ content: "Cancelled.", embeds: [], components: [] });
      } else if (i.customId === "submit") {
        collector.stop("submitted");

        const lines = pages
          .filter((p) => selections.get(p.emoji)!.size > 0)
          .map((p) => formatPingLine(p.emoji, p.label, selections.get(p.emoji)!));

        if (lines.length === 0) {
          await i.update({ content: "Nobody was selected.", embeds: [], components: [] });
          return;
        }

        await resolveDestination(message).send(lines.join("\n"));
        await i.update({ content: "Pinged.", embeds: [], components: [] });
      }
    });

    collector.on("end", async (_collected, reason) => {
      if (reason === "cancelled" || reason === "submitted") return;
      try {
        await interaction.editReply({ content: "Selection timed out.", embeds: [], components: [] });
      } catch {
        // interaction may already be gone
      }
    });
  },
};
