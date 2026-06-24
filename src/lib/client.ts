import { Client, Collection, GatewayIntentBits } from "discord.js";
import type {
  ChatInputCommandInteraction,
  ContextMenuCommandBuilder,
  MessageContextMenuCommandInteraction,
  SlashCommandBuilder,
} from "discord.js";

export type Command = {
  data: SlashCommandBuilder | ContextMenuCommandBuilder;
  execute: (
    interaction: ChatInputCommandInteraction | MessageContextMenuCommandInteraction,
  ) => Promise<void>;
};

export class BotClient extends Client {
  commands = new Collection<string, Command>();

  constructor() {
    super({ intents: [GatewayIntentBits.Guilds] });
  }
}

const isProd = process.env.NODE_ENV === "production";

export const token = isProd ? process.env.DISCORD_TOKEN_PROD! : process.env.DISCORD_TOKEN_DEV!;
export const clientId = isProd ? process.env.CLIENT_ID_PROD! : process.env.CLIENT_ID_DEV!;
export const guildId = process.env.GUILD_ID_DEV;
