import {
  accountCanonicalId,
  cleanText,
  getStoreWithFallback,
} from './_account-utils.mjs';
import { resolveFriendsAccount } from './_friends-production-authority.mjs';
import { lookupGameRankProjections } from './_game-rank-projections.mjs';
import { listLeagues } from './_league-utils.mjs';
import {
  normalizePublicPlayerHandle,
  publicPlayerIdentity,
} from './_public-player-identity.mjs';
import { TOURNAMENT_GAME_PROTOCOL_VERSION } from './_tournament-game-contract.mjs';
import { listPublicHostedTournaments } from './_tournament-events-utils.mjs';

export const PLAYER_PROFILE_CONTRACT_VERSION = '2026-10-11-player-profile-1';

const MAX_LEAGUE_CARDS = 12;
const MAX_VERIFIED_MATCHES = 24;

export class PlayerProfileError extends Error {
  constructor(code, message, statusCode = 400) {
    super(message);
    this.name = 'PlayerProfileError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

function publicGame(value) {
  return value === 'euchre' ? 'euchre' : 'spades';
}

function requestedHandle(value) {
  const handle = normalizePublicPlayerHandle(value);
  if (!handle) {
    throw new PlayerProfileError('invalid_handle', 'Enter a valid player username.', 400);
  }
  return handle;
}

function publicRankCard(card) {
  const ranked = card?.status === 'ranked' && Number.isInteger(Number(card?.rank)) && Number(card.rank) > 0;
  return {
    game: publicGame(card?.game),
    leaderboard: cleanText(card?.leaderboard).slice(0, 64),
    season: cleanText(card?.season).slice(0, 80),
    status: ranked ? 'ranked' : 'unranked',
    ...(ranked ? { rank: Number(card.rank) } : {}),
    provisional: card?.provisional === true,
    asOf: cleanText(card?.asOf).slice(0, 64),
  };
}

function isPublicLeague(league) {
  const visibility = cleanText(league?.visibility || 'public').toLowerCase();
  return visibility === 'public' && league?.status !== 'archived';
}

function publicLeagueCards(leagues, canonicalAccountId) {
  return (Array.isArray(leagues) ? leagues : [])
    .filter(isPublicLeague)
    .flatMap((league) => {
      const standing = (league.standings || []).find((entry) => (
        cleanText(entry?.canonicalAccountId || entry?.accountId) === canonicalAccountId
      ));
      if (!standing) return [];

      const rank = Number(standing.rank);
      return [{
        id: cleanText(league.id).slice(0, 160),
        name: cleanText(league.name || league.title || league.id).slice(0, 160),
        game: publicGame(league.gameSlug),
        season: {
          id: cleanText(league.season?.id || league.seasonId).slice(0, 120),
          name: cleanText(league.season?.name || league.seasonName).slice(0, 160),
        },
        status: cleanText(league.status || 'active').slice(0, 32),
        rank: Number.isInteger(rank) && rank > 0 ? rank : null,
        record: {
          wins: Math.max(0, Number.parseInt(standing.wins, 10) || 0),
          losses: Math.max(0, Number.parseInt(standing.losses, 10) || 0),
          ties: Math.max(0, Number.parseInt(standing.ties, 10) || 0),
        },
        asOf: cleanText(league.updatedAt).slice(0, 64),
      }];
    })
    .sort((left, right) => right.asOf.localeCompare(left.asOf) || left.name.localeCompare(right.name))
    .slice(0, MAX_LEAGUE_CARDS);
}

function verifiedFinalMatch(tournament, match) {
  const game = publicGame(tournament?.gameSlug);
  const completion = match?.completion;
  const winner = (match?.players || []).find((player) => (
    cleanText(player?.id) === cleanText(completion?.winnerParticipantId)
  ));

  return Boolean(
    match?.status === 'final'
    && completion?.protocolVersion === TOURNAMENT_GAME_PROTOCOL_VERSION
    && cleanText(completion?.game) === game
    && cleanText(completion?.completionId)
    && cleanText(completion?.completedAt)
    && winner
    && cleanText(match?.winnerId) === cleanText(completion?.winnerParticipantId)
    && cleanText(winner?.canonicalAccountId || winner?.accountId) === cleanText(completion?.winnerCanonicalAccountId),
  );
}

function verifiedTournamentHistory(tournaments, bracketsBySlug, canonicalAccountId) {
  const history = [];
  for (const tournament of Array.isArray(tournaments) ? tournaments : []) {
    const bracket = bracketsBySlug.get(cleanText(tournament?.slug));
    if (!bracket) continue;

    for (const round of bracket.rounds || []) {
      for (const match of round?.matches || []) {
        const participant = (match.players || []).find((player) => (
          cleanText(player?.canonicalAccountId || player?.accountId) === canonicalAccountId
        ));
        if (!participant || !verifiedFinalMatch(tournament, match)) continue;

        const winnerCanonicalAccountId = cleanText(match.completion?.winnerCanonicalAccountId);
        const scores = match.completion?.scores && typeof match.completion.scores === 'object'
          ? Object.fromEntries(Object.entries(match.completion.scores)
            .filter(([, score]) => Number.isFinite(Number(score)))
            .map(([seat, score]) => [cleanText(seat).slice(0, 16), Number(score)]))
          : null;
        history.push({
          tournament: {
            slug: cleanText(tournament.slug).slice(0, 160),
            title: cleanText(tournament.title || tournament.slug).slice(0, 180),
          },
          game: publicGame(tournament.gameSlug),
          round: {
            index: Number.isInteger(round.index) ? round.index : null,
            title: cleanText(round.title).slice(0, 120),
          },
          outcome: winnerCanonicalAccountId === canonicalAccountId ? 'win' : 'loss',
          ...(scores && Object.keys(scores).length ? { scores } : {}),
          completedAt: cleanText(match.completion.completedAt).slice(0, 64),
        });
      }
    }
  }

  return history
    .sort((left, right) => right.completedAt.localeCompare(left.completedAt) || left.tournament.slug.localeCompare(right.tournament.slug))
    .slice(0, MAX_VERIFIED_MATCHES);
}

async function defaultResolveByHandle(handle) {
  return resolveFriendsAccount({ searchHandle: handle });
}

async function defaultLoadBracket(slug) {
  return getStoreWithFallback('tournament-brackets').get(`${cleanText(slug)}.json`, { type: 'json' });
}

/**
 * This is a public, rank-only profile. It intentionally omits the canonical
 * account ID, email, historical display names, game ratings, and game records.
 */
export async function loadPublicPlayerProfile(handleValue, dependencies = {}) {
  const handle = requestedHandle(handleValue);
  const candidates = await (dependencies.resolveByHandle || defaultResolveByHandle)(handle);
  const accounts = (Array.isArray(candidates) ? candidates : [])
    .filter((account) => publicPlayerIdentity(account)?.handle === handle);
  if (accounts.length !== 1) {
    throw new PlayerProfileError('player_not_found', 'That player profile is unavailable.', 404);
  }

  const account = accounts[0];
  const player = publicPlayerIdentity(account);
  const canonicalAccountId = accountCanonicalId(account);
  if (!player || !canonicalAccountId) {
    throw new PlayerProfileError('player_not_found', 'That player profile is unavailable.', 404);
  }

  const [rankLookup, leagues, tournaments] = await Promise.all([
    (dependencies.lookupRanks || lookupGameRankProjections)([canonicalAccountId], { store: dependencies.projectionStore }),
    (dependencies.listLeagues || listLeagues)(),
    (dependencies.listPublicTournaments || listPublicHostedTournaments)(),
  ]);
  const ranks = (rankLookup?.projections || [])
    .find((entry) => cleanText(entry?.canonicalAccountId) === canonicalAccountId)?.ranks || [];
  const brackets = await Promise.all((Array.isArray(tournaments) ? tournaments : []).map(async (tournament) => [
    cleanText(tournament?.slug),
    await (dependencies.loadBracket || defaultLoadBracket)(tournament?.slug),
  ]));
  const verifiedMatches = verifiedTournamentHistory(
    tournaments,
    new Map(brackets.filter(([slug, bracket]) => slug && bracket)),
    canonicalAccountId,
  );

  return {
    contractVersion: PLAYER_PROFILE_CONTRACT_VERSION,
    player,
    ranks: ranks.map(publicRankCard)
      .sort((left, right) => left.game.localeCompare(right.game) || left.season.localeCompare(right.season)),
    leagues: publicLeagueCards(leagues, canonicalAccountId),
    tournaments: {
      verifiedMatches,
      summary: {
        matchesPlayed: verifiedMatches.length,
        wins: verifiedMatches.filter((match) => match.outcome === 'win').length,
        losses: verifiedMatches.filter((match) => match.outcome === 'loss').length,
      },
    },
  };
}
