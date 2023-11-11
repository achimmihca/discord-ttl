import { Channel, GuildTextBasedChannel, Message, PermissionFlagsBits, TextChannel } from 'discord.js';
import { client } from './app';

const sleepTimeInMillis = 1000;

export async function deleteOldMessages(
  timeToLiveInMillis: number,
  channelNames: string[],
  isPreviewRun: boolean
): Promise<void> {
  const allChannels = Array.from(client.channels.cache.values())
  const channels = allChannels
    .filter(channel => !channel.isDMBased()
      && channel.isTextBased()
      && channelNames.includes((channel as TextChannel)?.name));

  const timeToLiveInDays = timeToLiveInMillis / 1000 / 60 / 60 / 24;
  console.log(`Deleting messages of channels: ${channelNames} that are older than ${timeToLiveInMillis} milliseconds (${timeToLiveInDays} days)`);
  
  if (isPreviewRun)
  {
    console.log(`This is a preview run. Messages will not really be deleted`);
  }
  else
  {
    console.log(`WARNING: THIS IS NOT A PREVIEW RUN. MESSAGES WILL BE DELETED!`);
  }

  for (const channel of channels) {
    await deleteOldMessagesInChannel(timeToLiveInMillis, channel, isPreviewRun);
    
    await sleep(sleepTimeInMillis);
  }
}

async function sleep(ms: number) {
    console.log("sleeping " + ms + " milliseconds")
    return new Promise(resolve => setTimeout(resolve, ms))
}

async function deleteOldMessagesInChannel(
  timeToLiveInMillis: number,
  channel: Channel,
  isPreviewRun: boolean
): Promise<void> {
  if (channel.isDMBased()) {
    console.error("Cannot delete old messages of DM channel " + channel.id);
    return;
  }
  
  if (!channel.isTextBased()) {
    console.error("Cannot delete old messages of non-text-based channel " + channel.id);
    return;
  }

  if (!canGetAndDeleteMessages(channel)) {
    return;
  }

  const textChannel = channel as TextChannel;
  if (!textChannel)
  {
    console.error("Failed to convert channel to TextChannel: " + channel.name);
    return;
  }

  console.log(`Deleting old messages in channel ${channel.name}`)

  const messages = await getAllMessagesOfChannel(textChannel);
  console.log(`Found ${messages.length} messages in channel ${channel.name}`)

  const oldMessages = messages
    .filter ((message : Message) => isMessageOlderThanMillis(message, timeToLiveInMillis));
  console.log(`Found ${oldMessages.length} messages older than ${timeToLiveInMillis} millis in channel ${channel.name}`)
  
  const oldMessagesOldestFirst = oldMessages.reverse()

  // Discord API only allows to bulk-delete messages that are younger than 14 days.
  const bulkDeletableOldMessages = oldMessagesOldestFirst
  .filter((message: Message) => canMessageBeBulkDeleted(message));
  
  const nonBulkDeletableOldMessages = oldMessagesOldestFirst
  .filter((message: Message) => !canMessageBeBulkDeleted(message));

  if (nonBulkDeletableOldMessages.length > 0)
  {
    await doDeleteNonBulkDeletableMessages(textChannel, nonBulkDeletableOldMessages, isPreviewRun);
  }

  if (bulkDeletableOldMessages.length > 0)
  {
    await doDeletesBulkDeletableMessages(textChannel, bulkDeletableOldMessages, isPreviewRun);
  }
  await sleep(sleepTimeInMillis);
}

function canGetAndDeleteMessages(channel: GuildTextBasedChannel): boolean {
  const me = channel.guild.members.me;
  if (!me) {
    return false;
  }

  const currentPerms = me.permissionsIn(channel);

  const errorMessages: string[] = []
  if (!currentPerms.has(PermissionFlagsBits.ViewChannel))
  {
    errorMessages.push("Missing permission PermissionFlagsBits.ViewChannel for channel " + channel.name);
  }

  if (!currentPerms.has(PermissionFlagsBits.ReadMessageHistory))
  {
    errorMessages.push("Missing permission PermissionFlagsBits.ReadMessageHistory for channel " + channel.name);
  }

  if (!currentPerms.has(PermissionFlagsBits.ManageMessages))
  {
    errorMessages.push("Missing permission PermissionFlagsBits.ManageMessages for channel " + channel.name);
  }

  // Text-in-voice channels require Connect permissions, too (apparently)
  if (channel.isVoiceBased() && !currentPerms.has(PermissionFlagsBits.Connect)) {
      errorMessages.push("Missing permission PermissionFlagsBits.Connect for voice channel " + channel.name);
  }
  
  if (errorMessages.length > 0)
  {
    errorMessages.forEach(errorMessage => console.error(errorMessage))
    return false;
  }

  return true;
}

function canMessageBeBulkDeleted(message: Message): boolean {
  // Discord's bulk deletion threshold is 14 days
  const bulkDeletionThresholdInMillis: number = 1000 * 60 * 60 * 24 * 14;
  return !isMessageOlderThanMillis(message, bulkDeletionThresholdInMillis)
}

function isMessageOlderThanMillis(message: Message, timeInMillis: number)
{
  const messageAgeInMillis = Date.now() - message.createdAt.getTime();
  return messageAgeInMillis > timeInMillis;
}

/**
 * Messages older than Discord's bulk message deletion age limit cannot be
 * bulk deleted, so this method collects them and deletes them one-by-one.
 */
async function doDeleteNonBulkDeletableMessages(
  channel: TextChannel,
  messages: Message[],
  isPreviewRun: boolean
): Promise<void> {
  let deletedMessageCount = 0;
  for (const message of messages) {
    if (message.deletable)
    {
      console.log(`${new Date().toISOString()} - Deleting message (${deletedMessageCount + 1} / ${messages.length}) ${messageToString(message)} from channel ${channel.name}`)
      await message.delete()
      deletedMessageCount++;
    }
    else
    {
      console.log(`Not deletable: message ${messageToString(message)} from channel ${channel.name}`)
    }
  }
}

/**
 * Messages younger than Discord's bulk message deletion age limit can be
 * bulk deleted, so this method utilizes that feature to send batched delete requests.
 */
async function doDeletesBulkDeletableMessages(
  channel: TextChannel,
  messages: Message[],
  isPreviewRun: boolean
): Promise<void> {
  if (messages.length === 0) {
    return;
  }

  // https://discord.js.org/#/docs/main/stable/class/BaseGuildTextChannel?scrollTo=bulkDelete
  console.log(`Bulk deleting ${messages.length} messages from channel ${channel.name}: \n    ${messages.map(m => messageToString(m)).join('\n    ')}`)

  if (!isPreviewRun)
  {
    await channel
      .bulkDelete(messages);
  }
}

function messageToString(message: Message): string
{
  return `${message.id} by ${message.author.username} at ${message.createdAt.toISOString()}`
}

async function getAllMessagesOfChannel(
  channel: TextChannel
) {
  console.log(`Fetching all messages in channel ${channel.name}`)
  
  const messages: Message[] = [];

  // Create message pointer
  let message = await channel.messages
    .fetch({ limit: 1 })
    .then(messagePage => (messagePage.size === 1 ? messagePage.at(0) : null));

  // Collect messages in batches
  const maxFetchMessageCount = 100;
  const seenBeforeValues: string[] = []
  while (message) {
    const before = message.id
    if (seenBeforeValues.includes(before))
    {
      throw new Error(`Attempt to request the same messages twice, namely before ${before}`)
    }
    seenBeforeValues.push(before);

    console.log(`Fetching messages of channel ${channel.name} before ${before}, limit = ${maxFetchMessageCount}`)
    await channel.messages
      .fetch({
        limit: maxFetchMessageCount,
        before: before,
      })
      .then(messagePage => {
        messagePage.forEach(msg => messages.push(msg));

        // Update our message pointer to be the last message on the page of messages
        message = 0 < messagePage.size
          ? messagePage.at(messagePage.size - 1)
          : null;
      });
  }

  return messages;
}