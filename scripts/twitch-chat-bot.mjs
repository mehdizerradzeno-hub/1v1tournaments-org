import tls from 'node:tls';
import { existsSync, readFileSync } from 'node:fs';

const TWITCH_IRC_HOST = 'irc.chat.twitch.tv';
const TWITCH_IRC_PORT = 6697;
const DEFAULT_COMMAND_ENDPOINT = 'https://1v1tournaments.org/.netlify/functions/stream-commands';
const ENV_FILE = '.env.twitch-bot';

loadEnvFile(ENV_FILE);

const COMMAND_REFRESH_MS = positiveInteger(process.env.TWITCH_COMMAND_REFRESH_MS, 60_000);
const RESPONSE_COOLDOWN_MS = positiveInteger(process.env.TWITCH_COMMAND_COOLDOWN_MS, 4_000);
const DRY_RUN = cleanEnv(process.env.TWITCH_BOT_DRY_RUN) === '1';

const botUsername = cleanEnv(process.env.TWITCH_BOT_USERNAME).toLowerCase();
const oauthToken = cleanEnv(process.env.TWITCH_OAUTH_TOKEN);
const channel = cleanEnv(process.env.TWITCH_CHANNEL || '1v1compspades').replace(/^#/, '').toLowerCase();
const commandEndpoint = cleanEnv(process.env.STREAM_COMMAND_ENDPOINT || DEFAULT_COMMAND_ENDPOINT);

let commands = new Map();
let lastCommandLoadAt = 0;
const cooldowns = new Map();

function cleanEnv(value) {
  return String(value || '').trim();
}

function loadEnvFile(path) {
  if (!existsSync(path)) {
    return;
  }

  const lines = readFileSync(path, 'utf8').split(/\r?\n/);

  lines.forEach((line) => {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      return;
    }

    const equalsIndex = trimmed.indexOf('=');

    if (equalsIndex <= 0) {
      return;
    }

    const key = trimmed.slice(0, equalsIndex).trim();
    const rawValue = trimmed.slice(equalsIndex + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, '');

    if (!process.env[key]) {
      process.env[key] = value;
    }
  });
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function assertConfig() {
  const missing = [];

  if (!botUsername) missing.push('TWITCH_BOT_USERNAME');
  if (!oauthToken) missing.push('TWITCH_OAUTH_TOKEN');
  if (!channel) missing.push('TWITCH_CHANNEL');

  if (missing.length) {
    console.error(`Missing required env: ${missing.join(', ')}`);
    console.error(`Create ${ENV_FILE} from ${ENV_FILE}.example, then run npm run bot:twitch.`);
    process.exit(1);
  }

  if (!oauthToken.startsWith('oauth:')) {
    console.error('TWITCH_OAUTH_TOKEN must start with oauth:.');
    process.exit(1);
  }
}

function parseIrcMessage(line) {
  const message = { raw: line, tags: {}, prefix: '', command: '', params: [], trailing: '' };
  let rest = line;

  if (rest.startsWith('@')) {
    const tagEnd = rest.indexOf(' ');
    const tagText = rest.slice(1, tagEnd);
    rest = rest.slice(tagEnd + 1);
    tagText.split(';').forEach((pair) => {
      const [key, value = ''] = pair.split('=');
      message.tags[key] = value;
    });
  }

  if (rest.startsWith(':')) {
    const prefixEnd = rest.indexOf(' ');
    message.prefix = rest.slice(1, prefixEnd);
    rest = rest.slice(prefixEnd + 1);
  }

  const trailingIndex = rest.indexOf(' :');

  if (trailingIndex >= 0) {
    message.trailing = rest.slice(trailingIndex + 2);
    rest = rest.slice(0, trailingIndex);
  }

  const parts = rest.split(' ').filter(Boolean);
  message.command = parts.shift() || '';
  message.params = parts;

  return message;
}

function say(socket, text) {
  const safeText = String(text || '').replace(/[\r\n]+/g, ' ').slice(0, 450);

  if (safeText) {
    socket.write(`PRIVMSG #${channel} :${safeText}\r\n`);
  }
}

function commandFromChat(text) {
  const firstWord = String(text || '').trim().split(/\s+/)[0]?.toLowerCase() || '';
  return firstWord.startsWith('!') ? firstWord : '';
}

function canRespond(command) {
  const now = Date.now();
  const lastSentAt = cooldowns.get(command) || 0;

  if (now - lastSentAt < RESPONSE_COOLDOWN_MS) {
    return false;
  }

  cooldowns.set(command, now);
  return true;
}

async function loadCommands({ force = false } = {}) {
  const now = Date.now();

  if (!force && now - lastCommandLoadAt < COMMAND_REFRESH_MS) {
    return;
  }

  const response = await fetch(commandEndpoint, {
    headers: {
      accept: 'application/json',
      'user-agent': '1v1tournaments-twitch-chat-bot/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Command endpoint returned ${response.status}`);
  }

  const result = await response.json();
  const nextCommands = new Map();

  (result.commands || []).forEach((item) => {
    const command = String(item.command || '').trim().toLowerCase();
    const responseText = String(item.response || '').trim();

    if (/^![a-z0-9][a-z0-9_-]{0,24}$/.test(command) && responseText) {
      nextCommands.set(command, responseText);
    }
  });

  if (!nextCommands.size) {
    throw new Error('Command endpoint returned no usable commands.');
  }

  commands = nextCommands;
  lastCommandLoadAt = now;
  console.log(`Loaded ${commands.size} stream command${commands.size === 1 ? '' : 's'} from ${commandEndpoint}`);
}

function connect() {
  assertConfig();

  const socket = tls.connect(TWITCH_IRC_PORT, TWITCH_IRC_HOST, () => {
    socket.write(`PASS ${oauthToken}\r\n`);
    socket.write(`NICK ${botUsername}\r\n`);
    socket.write('CAP REQ :twitch.tv/tags twitch.tv/commands\r\n');
    socket.write(`JOIN #${channel}\r\n`);
    console.log(`Connected to Twitch chat as ${botUsername}, joining #${channel}`);
  });

  socket.setEncoding('utf8');

  let buffer = '';

  socket.on('data', async (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\r\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line) continue;

      if (line.startsWith('PING ')) {
        socket.write(`PONG ${line.slice(5)}\r\n`);
        continue;
      }

      const message = parseIrcMessage(line);

      if (message.command !== 'PRIVMSG') {
        continue;
      }

      const command = commandFromChat(message.trailing);

      if (!command || !canRespond(command)) {
        continue;
      }

      try {
        await loadCommands();
      } catch (error) {
        console.error(error instanceof Error ? error.message : 'Could not refresh commands.');
      }

      const response = commands.get(command);

      if (response) {
        say(socket, response);
      }
    }
  });

  socket.on('error', (error) => {
    console.error('Twitch chat connection error:', error.message);
  });

  socket.on('close', () => {
    console.error('Twitch chat connection closed. Reconnecting in 10 seconds...');
    setTimeout(connect, 10_000);
  });
}

await loadCommands({ force: true });

if (DRY_RUN) {
  assertConfig();
  console.log(`Dry run OK: ${commands.size} commands loaded for #${channel} as ${botUsername}.`);
} else {
  connect();
}
