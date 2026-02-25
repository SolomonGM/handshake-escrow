import axios from 'axios';
import crypto from 'crypto';

const DISCORD_API_BASE = 'https://discord.com/api/v10';

const getDiscordBotToken = () => String(process.env.DISCORD_BOT_TOKEN || '').trim();
const getDiscordGuildId = () => String(process.env.DISCORD_GUILD_ID || '').trim();
const getDiscordApplicationId = () => (
  String(process.env.DISCORD_APPLICATION_ID || process.env.DISCORD_CLIENT_ID || '').trim()
);
const getDiscordApplicationPublicKey = () => (
  String(process.env.DISCORD_APPLICATION_PUBLIC_KEY || '').trim()
);

const getDiscordCommandConfig = () => {
  const botToken = getDiscordBotToken();
  const guildId = getDiscordGuildId();
  const applicationId = getDiscordApplicationId();
  return {
    botToken,
    guildId,
    applicationId,
    isConfigured: Boolean(botToken && guildId && applicationId)
  };
};

const getDiscordPublicKeyObject = () => {
  const publicKeyHex = getDiscordApplicationPublicKey();
  if (!/^[a-fA-F0-9]{64}$/.test(publicKeyHex)) {
    return null;
  }

  // Ed25519 SubjectPublicKeyInfo DER prefix
  const spkiPrefixHex = '302a300506032b6570032100';
  const der = Buffer.from(`${spkiPrefixHex}${publicKeyHex}`, 'hex');
  return crypto.createPublicKey({
    key: der,
    format: 'der',
    type: 'spki'
  });
};

export const verifyDiscordInteractionRequest = ({ signature, timestamp, rawBody }) => {
  if (!signature || !timestamp || !rawBody) {
    return false;
  }

  const publicKey = getDiscordPublicKeyObject();
  if (!publicKey) {
    return false;
  }

  if (!/^[a-fA-F0-9]{128}$/.test(signature)) {
    return false;
  }

  const signatureBuffer = Buffer.from(signature, 'hex');
  const payload = Buffer.concat([
    Buffer.from(String(timestamp), 'utf8'),
    Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody)
  ]);

  try {
    return crypto.verify(null, payload, publicKey, signatureBuffer);
  } catch (error) {
    return false;
  }
};

export const ensureDiscordSyncCommandRegistered = async () => {
  const { botToken, guildId, applicationId, isConfigured } = getDiscordCommandConfig();
  if (!isConfigured) {
    return {
      success: false,
      skipped: true,
      message: 'Discord sync command registration skipped (missing DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, or DISCORD_CLIENT_ID/DISCORD_APPLICATION_ID).'
    };
  }

  try {
    await axios.post(
      `${DISCORD_API_BASE}/applications/${applicationId}/guilds/${guildId}/commands`,
      {
        name: 'sync',
        description: 'Sync your linked Handshake rank role in Discord',
        type: 1
      },
      {
        headers: {
          Authorization: `Bot ${botToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    return {
      success: true,
      skipped: false,
      message: 'Discord /sync command registered.'
    };
  } catch (error) {
    const message = error?.response?.data?.message || error?.message || 'Unknown Discord API error';
    return {
      success: false,
      skipped: false,
      message: `Discord /sync command registration failed: ${message}`
    };
  }
};

export const sendDiscordInteractionFollowup = async ({
  applicationId,
  interactionToken,
  content,
  isEphemeral = true
}) => {
  if (!applicationId || !interactionToken) {
    return false;
  }

  try {
    await axios.post(
      `${DISCORD_API_BASE}/webhooks/${applicationId}/${interactionToken}`,
      {
        content: String(content || ''),
        flags: isEphemeral ? 64 : 0
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
    return true;
  } catch (error) {
    console.error('Discord interaction follow-up failed:', error?.response?.data || error?.message || error);
    return false;
  }
};
