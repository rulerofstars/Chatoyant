import { MessageFlags, type Message, type MessageContextMenuCommandInteraction } from "discord.js";

/**
 * Replies with a rejection and returns false if the interacting user isn't the
 * original message author; otherwise returns true.
 */
export async function requireOriginalPoster(
  interaction: MessageContextMenuCommandInteraction,
  message: Message,
): Promise<boolean> {
  if (interaction.user.id === message.author.id) return true;
  await interaction.reply({ content: "Only the original poster can use this.", flags: MessageFlags.Ephemeral });
  return false;
}
