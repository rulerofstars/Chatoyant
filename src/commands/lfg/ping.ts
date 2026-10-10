import type { GuildTextBasedChannel, Message } from "discord.js";

/** Formats one "emoji `label`: @mentions" ping line. */
export function formatPingLine(emoji: string, label: string, ids: Iterable<string>): string {
  const mentions = [...ids].map((id) => `<@${id}>`).join(" ");
  return label ? `${emoji} \`${label}\`: ${mentions}` : `${emoji}: ${mentions}`;
}

/** The message's thread if it has one, otherwise the channel it was posted in. */
export function resolveDestination(message: Message): GuildTextBasedChannel {
  return (message.hasThread && message.thread ? message.thread : message.channel) as GuildTextBasedChannel;
}
