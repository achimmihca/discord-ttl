import { Client, Partials } from 'discord.js';
import dotenv from 'dotenv';
import { deleteOldMessages } from './ttl';
dotenv.config();

const serverMessageTtlMillis = Number(process.env.DEFAULT_MESSAGE_TTL) * 1000;
if (serverMessageTtlMillis <= 0)
{
  throw new Error("Time to live must be positive but was " + serverMessageTtlMillis)
}

const channelNames = [
  "general",
]

const isPreviewRun = true

export const client = new Client({
  intents: ['Guilds'],
  partials: [Partials.Channel, Partials.Message],
});

client.once('ready', async () => {
  console.log('Discord TTL is now running!');
  await deleteOldMessages(serverMessageTtlMillis, channelNames, isPreviewRun)
    .catch(console.error);
  console.log('Discord TTL has finished');
  process.exit();
});

client.login(process.env.DISCORD_BOT_TOKEN)
  .catch((err: any) => {
    console.error(err);
    process.exit();
  });
