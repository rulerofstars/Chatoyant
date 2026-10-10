import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type MessageContextMenuCommandInteraction,
} from "discord.js";
import { emojiIdentifier } from "./emoji.ts";

const ROW_BREAK = { name: "​", value: "​", inline: false } as const;

/**
 * Message context menu command: right-click a message -> Apps -> View Reactions.
 *
 * Fetches all emoji reactions on the target message,
 * then builds an ephemeral embed showing each emoji with the list of reactors. 
 * 
 * Requires the bot to have READ_MESSAGE_HISTORY and VIEW_CHANNEL in the target channel
 * (needed for reaction.users.fetch()).
 */
export default {
  data: new ContextMenuCommandBuilder()
    .setName("View Reactions")
    .setType(ApplicationCommandType.Message),

  async execute(interaction: MessageContextMenuCommandInteraction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const message = interaction.targetMessage;

    if (message.reactions.cache.size === 0) {
      await interaction.editReply("No reactions on that message.");
      return;
    }

    const botId = interaction.client.user.id;
    const allUserIds = new Set<string>();

    const reactionData: Array<{ emoji: string; userIds: string[] }> = [];

    for (const reaction of message.reactions.cache.values()) {
      const fetched = await reaction.users.fetch();
      const users = [...fetched.values()].filter((u) => u.id !== botId);

      for (const u of users) allUserIds.add(u.id);

      const emoji = emojiIdentifier(reaction.emoji) || "?";

      reactionData.push({ emoji, userIds: users.map((u) => u.id) });
    }

    const members =
      allUserIds.size > 0
        ? await interaction.guild!.members.fetch({ user: [...allUserIds] })
        : null;

    const embed = new EmbedBuilder()
      .setTitle("Reactions for this post")
      .setDescription(`Unique Users: **${allUserIds.size}**`)
      .setColor(0x5865f2);

    let col = 0;
    for (const { emoji, userIds } of reactionData) {
      if (userIds.length === 0) continue;

      const lines = userIds.flatMap((id) => {
        const member = members?.get(id);
        const username = member?.user.username ?? id;
        return [`• <@${id}>`, `*(${username})*`];
      });

      let value = lines.join("\n");
      if (value.length > 1024) value = value.slice(0, 1021) + "…";

      embed.addFields({ name: emoji, value, inline: true });
      col++;
      if (col % 2 === 0) embed.addFields(ROW_BREAK);
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
