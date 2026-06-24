import { readdirSync } from "fs";
import { join } from "path";
import { BotClient, token } from "./lib/client.ts";

const client = new BotClient();

for (const file of readdirSync(join(import.meta.dir, "events")).filter((f) => f.endsWith(".ts"))) {
  const event = await import(join(import.meta.dir, "events", file));
  if (event.default.once) {
    client.once(event.default.name, (...args) => event.default.execute(...args));
  } else {
    client.on(event.default.name, (...args) => event.default.execute(...args));
  }
}

for (const folder of readdirSync(join(import.meta.dir, "commands"))) {
  const folderPath = join(import.meta.dir, "commands", folder);
  for (const file of readdirSync(folderPath).filter((f) => f.endsWith(".ts"))) {
    const command = await import(join(folderPath, file));
    if ("default" in command && "data" in command.default && "execute" in command.default) {
      client.commands.set(command.default.data.name, command.default);
    }
  }
}

client.login(token);
