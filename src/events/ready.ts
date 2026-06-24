import { Events } from "discord.js";
import type { BotClient } from "../lib/client.ts";

export default {
  name: Events.ClientReady,
  once: true,
  execute(client: BotClient) {
    console.log(`Ready! Logged in as ${client.user?.tag}`);
  },
};
