import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  FriendsAuthority,
  InMemoryFriendsAuthorityStore,
} from "../netlify/functions/_friends-authority.mjs";
import { handleFriendsRequest } from "../netlify/functions/friends.mjs";

function externalWorktree(
  environmentKey: string,
  defaultWorktree: string,
): string {
  const worktreesRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const worktree = process.env[environmentKey]?.trim()
    || resolve(worktreesRoot, defaultWorktree);
  if (!existsSync(worktree)) {
    throw new Error(`${environmentKey} must point to an available worktree.`);
  }
  return worktree;
}

function externalModule(worktree: string, relativePath: string): string {
  const modulePath = resolve(worktree, relativePath);
  if (!existsSync(modulePath)) {
    throw new Error(`Worktree must contain ${relativePath}`);
  }
  return pathToFileURL(modulePath).href;
}

function sourceForFunction(sourcePath: string, functionName: string): string {
  const source = readFileSync(sourcePath, "utf8");
  const start = source.indexOf(`function ${functionName}(`);
  const end = source.indexOf("\n}", start);
  if (start < 0 || end < 0) {
    throw new Error(`${functionName} was not found in ${sourcePath}`);
  }
  return source.slice(start, end + 2);
}

const spadesWorktree = externalWorktree(
  "SPADES_FRIENDS_WORKTREE",
  "spades-friends-rank-cards",
);
const euchreWorktree = externalWorktree(
  "EUCHRE_FRIENDS_WORKTREE",
  "euchre-friends-rank-cards",
);

const {
  SpadesFriendsService,
  SpadesHubFriendsClient,
} = await import(externalModule(
  spadesWorktree,
  "artifacts/api-server/src/lib/spades-friends.ts",
));
const { EuchreHubFriendsClient } = await import(externalModule(
  euchreWorktree,
  "artifacts/api-server/src/hub-friends-client.ts",
));
const { EuchreFriendsService } = await import(externalModule(
  euchreWorktree,
  "artifacts/api-server/src/friends-service.ts",
));

const accounts = new Map([
  ["acct-spades", { canonicalAccountId: "acct-spades", playerHandle: "spades_player", usernameClaimedAt: "2026-10-11T00:00:00.000Z" }],
  ["acct-euchre", { canonicalAccountId: "acct-euchre", playerHandle: "euchre_player", usernameClaimedAt: "2026-10-11T00:00:00.000Z" }],
]);
const secret = "x".repeat(32);
const env = {
  HUB_FRIENDS_ENABLED: "true",
  HUB_FRIENDS_SPADES_SECRET: secret,
  HUB_FRIENDS_EUCHRE_SECRET: secret,
};

test("a shared relationship and game-local rank projection cross the supplied game worktrees", async () => {
  const authority = new FriendsAuthority({
    store: new InMemoryFriendsAuthorityStore(),
    resolveAccount: async (input: string | { searchHandle: string }) => typeof input === "string"
      ? accounts.get(input) ?? null
      : [...accounts.values()].filter((account) => account.playerHandle === input.searchHandle),
  });
  const dispatch = async (_url: string | URL, init: { headers?: HeadersInit; body?: BodyInit | null }) => {
    const headers = init.headers instanceof Headers
      ? Object.fromEntries(init.headers.entries())
      : init.headers ?? {};
    const response = await handleFriendsRequest({
      httpMethod: "POST",
      headers,
      body: typeof init.body === "string" ? init.body : "{}",
    }, {
      env,
      authority,
      syncProfile: async ({ canonicalAccountId, handle, displayName }: {
        canonicalAccountId: string;
        handle: string;
        displayName: string;
      }) => {
        const profile = {
          canonicalAccountId,
          playerHandle: handle,
          usernameClaimedAt: "2026-10-11T00:00:00.000Z",
        };
        accounts.set(canonicalAccountId, profile);
        return {
          canonicalAccountId,
          handle,
          displayName,
        };
      },
    });
    const payload = JSON.parse(response.body);
    return { ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, json: async () => payload };
  };

  const spades = new SpadesFriendsService(
    new SpadesHubFriendsClient(true, secret, dispatch, "https://1v1tournaments.org"),
    {
      resolveRanks: async (canonicalAccountIds: readonly string[]) => new Map(
        canonicalAccountIds.map((canonicalAccountId) => [
          canonicalAccountId,
          { state: "ranked", rank: 7 },
        ]),
      ),
    },
  );
  const euchre = new EuchreFriendsService({
    resolve: async () => ({
      source: "validated_shared",
      competitiveIdentityState: "active",
      canonicalAccountId: "acct-euchre",
      handle: "euchre_player",
      displayName: "Euchre Player",
    }),
  } as any, new EuchreHubFriendsClient(true, secret, dispatch as any, "https://1v1tournaments.org"));

  await spades.syncProfile({
    publicIdentity: {
      canonicalAccountId: "acct-spades",
      handle: "spades_player",
      displayName: "Spades Player",
    },
  });
  await euchre.syncProfile("opaque-euchre-session");
  const sent = await dispatch("https://1v1tournaments.org/.netlify/functions/friends", {
    headers: {
      authorization: `Bearer ${secret}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      audience: "spades",
      action: "send",
      actorCanonicalAccountId: "acct-spades",
      targetCanonicalAccountId: "acct-euchre",
    }),
  });
  assert.equal(sent.ok, true, JSON.stringify(await sent.json()));
  const incoming = await euchre.snapshot("opaque-euchre-session");
  assert.deepEqual(incoming.incoming.map((profile) => profile.handle), ["spades_player"]);

  await euchre.mutate("opaque-euchre-session", "accept", "acct-spades", "euchre-accept");
  const spadesSnapshot = await spades.snapshot({
    publicIdentity: { canonicalAccountId: "acct-spades" },
  });
  assert.deepEqual(spadesSnapshot.friends.map((profile) => profile.handle), ["euchre_player"]);
  assert.deepEqual(spadesSnapshot.friends.map((profile) => profile.spadesRank), [
    { state: "ranked", rank: 7 },
  ]);

  await euchre.heartbeat("opaque-euchre-session");
  const spadesView = await spades.snapshot({
    publicIdentity: { canonicalAccountId: "acct-spades" },
  });
  assert.deepEqual(spadesView.friends.map((profile) => profile.presence), ["online_euchre"]);

  const spadesProfileLink = sourceForFunction(
    resolve(spadesWorktree, "artifacts/spades-game/src/pages/Friends.tsx"),
    "publicProfileUrl",
  );
  const euchreProfileLink = sourceForFunction(
    resolve(euchreWorktree, "artifacts/euchre-game/src/main.ts"),
    "publicProfileUrl",
  );
  for (const profileLink of [spadesProfileLink, euchreProfileLink]) {
    assert.match(profileLink, /\/players\//);
    assert.match(profileLink, /encodeURIComponent\(publicHandle\)/);
    assert.doesNotMatch(profileLink, /displayName|canonicalAccountId/);
  }
});
