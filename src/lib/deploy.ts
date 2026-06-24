import { REST, Routes } from "discord.js";
import { readdirSync } from "fs";
import { join } from "path";
import { clientId, guildId, token } from "./client.ts";

const commands: unknown[] = [];
const commandsPath = join(import.meta.dir, "../commands");

for (const folder of readdirSync(commandsPath)) {
  const folderPath = join(commandsPath, folder);
  for (const file of readdirSync(folderPath).filter((f) => f.endsWith(".ts"))) {
    const command = await import(join(folderPath, file));
    if ("default" in command && "data" in command.default) {
      commands.push(command.default.data.toJSON());
    }
  }
}

const rest = new REST().setToken(token);
const isProd = process.env.NODE_ENV === "production";

if (isProd) {
  await rest.put(Routes.applicationCommands(clientId), { body: commands });
  console.log("Registered global commands.");
} else {
  if (!guildId) throw new Error("GUILD_ID_DEV is not set");
  await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: commands });
  console.log("Registered guild commands.");
}
