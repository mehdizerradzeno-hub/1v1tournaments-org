import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const LABEL = 'org.1v1tournaments.twitch-bot';
const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PLIST_PATH = join(homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const OUT_LOG = '/tmp/1v1tournaments-twitch-bot.log';
const ERR_LOG = '/tmp/1v1tournaments-twitch-bot.err.log';
const ENV_FILE = join(PROJECT_ROOT, '.env.twitch-bot');
const BOT_SCRIPT = join(PROJECT_ROOT, 'scripts', 'twitch-chat-bot.mjs');

const uid = String(process.getuid?.() || execFileSync('id', ['-u'], { encoding: 'utf8' }).trim());
const serviceTarget = `gui/${uid}`;
const serviceName = `${serviceTarget}/${LABEL}`;

function usage() {
  console.log(`Usage: node scripts/twitch-bot-service.mjs <install|uninstall|start|stop|restart|status|logs>`);
}

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
    stdio: options.stdio || 'pipe',
  });
}

function runQuiet(command, args) {
  const result = spawnSync(command, args, {
    cwd: PROJECT_ROOT,
    encoding: 'utf8',
  });

  return result;
}

function assertMac() {
  if (process.platform !== 'darwin') {
    throw new Error('The Twitch bot background service uses macOS launchd.');
  }
}

function assertEnvReady() {
  if (!existsSync(ENV_FILE)) {
    throw new Error(`Missing ${ENV_FILE}. Create it from .env.twitch-bot.example first.`);
  }

  const env = readFileSync(ENV_FILE, 'utf8');
  const tokenLine = env.match(/^TWITCH_OAUTH_TOKEN=(.+)$/m);
  const usernameLine = env.match(/^TWITCH_BOT_USERNAME=(.+)$/m);

  if (!usernameLine?.[1]?.trim()) {
    throw new Error('TWITCH_BOT_USERNAME is missing in .env.twitch-bot.');
  }

  if (!tokenLine?.[1]?.trim().startsWith('oauth:')) {
    throw new Error('TWITCH_OAUTH_TOKEN must be set and start with oauth: in .env.twitch-bot.');
  }
}

function plist() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${process.execPath}</string>
    <string>${BOT_SCRIPT}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${PROJECT_ROOT}</string>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${OUT_LOG}</string>
  <key>StandardErrorPath</key>
  <string>${ERR_LOG}</string>
</dict>
</plist>
`;
}

function install() {
  assertMac();
  assertEnvReady();
  mkdirSync(dirname(PLIST_PATH), { recursive: true });
  writeFileSync(PLIST_PATH, plist(), 'utf8');
  runQuiet('launchctl', ['bootout', serviceTarget, PLIST_PATH]);
  run('launchctl', ['bootstrap', serviceTarget, PLIST_PATH]);
  runQuiet('launchctl', ['enable', serviceName]);
  run('launchctl', ['kickstart', '-k', serviceName]);
  console.log(`Installed and started ${LABEL}.`);
  console.log(`Logs: ${OUT_LOG}`);
  console.log(`Errors: ${ERR_LOG}`);
}

function uninstall() {
  assertMac();
  runQuiet('launchctl', ['bootout', serviceTarget, PLIST_PATH]);
  console.log(`Stopped ${LABEL}.`);
  console.log(`LaunchAgent file remains at ${PLIST_PATH}; delete it only if you no longer want this setup.`);
}

function start() {
  assertMac();
  if (!existsSync(PLIST_PATH)) {
    install();
    return;
  }

  assertEnvReady();
  runQuiet('launchctl', ['bootstrap', serviceTarget, PLIST_PATH]);
  run('launchctl', ['kickstart', '-k', serviceName]);
  console.log(`Started ${LABEL}.`);
}

function stop() {
  assertMac();
  runQuiet('launchctl', ['bootout', serviceTarget, PLIST_PATH]);
  console.log(`Stopped ${LABEL}.`);
}

function status() {
  assertMac();
  const result = runQuiet('launchctl', ['print', serviceName]);

  if (result.status === 0) {
    console.log(result.stdout.trim());
    return;
  }

  console.log(`${LABEL} is not loaded.`);
}

function logs() {
  [OUT_LOG, ERR_LOG].forEach((path) => {
    console.log(`\n== ${path} ==`);
    if (!existsSync(path)) {
      console.log('No log file yet.');
      return;
    }

    const lines = readFileSync(path, 'utf8').trim().split(/\r?\n/).slice(-80);
    console.log(lines.join('\n') || 'No log output yet.');
  });
}

const command = process.argv[2];

try {
  if (command === 'install') install();
  else if (command === 'uninstall') uninstall();
  else if (command === 'start') start();
  else if (command === 'stop') stop();
  else if (command === 'restart') {
    stop();
    start();
  } else if (command === 'status') status();
  else if (command === 'logs') logs();
  else {
    usage();
    process.exit(command ? 1 : 0);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
