import { downloadLinks } from './downloadLinks.js';

export const STREAM_COMMAND_ENDPOINT = '/.netlify/functions/stream-commands';

function absoluteSiteUrl(path) {
  const origin = downloadLinks.tournaments || 'https://1v1tournaments.org';

  return `${origin.replace(/\/$/, '')}${path}`;
}

export function buildDefaultStreamCommands({ hasDiscord = Boolean(downloadLinks.discord), nextTournamentPath = '/next' } = {}) {
  const tournamentUrl = absoluteSiteUrl(nextTournamentPath);

  return [
    {
      command: '!next',
      response: `Next tournament: ${absoluteSiteUrl('/next')}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!join',
      response: `Join the next tournament: ${absoluteSiteUrl('/next')}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!signup',
      response: `Create an account and join the tournament: ${absoluteSiteUrl('/next')}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!match',
      response: `Find your match and bracket status: ${absoluteSiteUrl(`${nextTournamentPath}#my-match`)}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!bracket',
      response: `Tournament bracket and roster: ${tournamentUrl}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!format',
      response: `Tournament format, roster, and bracket details: ${tournamentUrl}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!rules',
      response: `Tournament rules: ${absoluteSiteUrl('/rules')}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!results',
      response: `Tournament results and standings: ${absoluteSiteUrl('/results')}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!discord',
      response: hasDiscord ? `Join Discord: ${downloadLinks.discord}` : `Discord will be posted here: ${absoluteSiteUrl('/live')}`,
      where: 'Twitch chat bot',
    },
    {
      command: '!live',
      response: `Live hub and stream links: ${absoluteSiteUrl('/live')}`,
      where: 'Twitch chat bot',
    },
  ];
}

export function normalizeStreamCommands(commands) {
  if (!Array.isArray(commands)) {
    return [];
  }

  const seen = new Set();

  return commands
    .map((item) => ({
      command: String(item?.command || '').trim().toLowerCase(),
      response: String(item?.response || '').trim(),
      where: String(item?.where || 'Twitch chat bot').trim(),
    }))
    .filter((item) => {
      if (!/^![a-z0-9][a-z0-9_-]{0,24}$/.test(item.command) || !item.response || seen.has(item.command)) {
        return false;
      }

      seen.add(item.command);
      return true;
    })
    .slice(0, 25);
}
