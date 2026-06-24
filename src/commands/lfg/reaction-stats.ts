import {
  ApplicationCommandType,
  ContextMenuCommandBuilder,
  EmbedBuilder,
  MessageFlags,
  type MessageContextMenuCommandInteraction,
} from "discord.js";

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

      const emoji = reaction.emoji.id
        ? `<${reaction.emoji.animated ? "a" : ""}:${reaction.emoji.name}:${reaction.emoji.id}>`
        : (reaction.emoji.name ?? "?");

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

    for (const { emoji, userIds } of reactionData) {
      if (userIds.length === 0) continue;

      const lines = userIds.flatMap((id) => {
        const member = members?.get(id);
        const username = member?.user.username ?? id;
        const line = [`• <@${id}>`];
        line.push(`*(${username})*`);
        return line;
      });

      let value = lines.join("\n");
      if (value.length > 1024) value = value.slice(0, 1021) + "…";

      embed.addFields({ name: emoji, value, inline: true });
    }

    await interaction.editReply({ embeds: [embed] });
  },
};
