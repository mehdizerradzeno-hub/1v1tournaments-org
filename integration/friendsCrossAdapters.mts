import assert from "node:assert/strict";
import test from "node:test";

import {
  SpadesHubFriendsAdapter,
  SpadesHubFriendsClient,
} from "../../spades/artifacts/api-server/src/lib/hub-friends-client.ts";
import {
  EuchreHubFriendsClient,
} from "../../euchre/artifacts/api-server/src/hub-friends-client.ts";
import { EuchreFriendsService } from "../../euchre/artifacts/api-server/src/friends-service.ts";
import {
  FriendsAuthority,
  InMemoryFriendsAuthorityStore,
} from "../netlify/functions/_friends-authority.mjs";
import { handleFriendsRequest } from "../netlify/functions/friends.mjs";

const accounts = new Map([
  ["acct-spades", { canonicalAccountId: "acct-spades", playerHandle: "spades-player", playerName: "Spades Player" }],
  ["acct-euchre", { canonicalAccountId: "acct-euchre", playerHandle: "euchre-player", playerName: "Euchre Player" }],
]);
const secret = "x".repeat(32);
const env = {
  HUB_FRIENDS_ENABLED: "true",
  HUB_FRIENDS_SPADES_SECRET: secret,
  HUB_FRIENDS_EUCHRE_SECRET: secret,
};

test("a relationship created through Spades is visible and mutable through Euchre", async () => {
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
    }, { env, authority });
    const payload = JSON.parse(response.body);
    return { ok: response.statusCode >= 200 && response.statusCode < 300, status: response.statusCode, json: async () => payload };
  };

  const spades = new SpadesHubFriendsAdapter(new SpadesHubFriendsClient(true, secret, dispatch, "https://1v1tournaments.org"));
  const euchre = new EuchreFriendsService({
    resolve: async () => ({
      source: "validated_shared",
      competitiveIdentityState: "active",
      canonicalAccountId: "acct-euchre",
    }),
  } as any, new EuchreHubFriendsClient(true, secret, dispatch as any, "https://1v1tournaments.org"));

  await spades.send({
    identity: { canonicalIdentityValidated: true },
    publicIdentity: { canonicalAccountId: "acct-spades" },
  } as any, "acct-euchre", "spades-send");
  const incoming = await euchre.snapshot("opaque-euchre-session");
  assert.deepEqual(incoming.incoming.map((profile) => profile.handle), ["spades-player"]);

  await euchre.mutate("opaque-euchre-session", "accept", "acct-spades", "euchre-accept");
  const spadesSnapshot = await spades.snapshot({
    identity: { canonicalIdentityValidated: true },
    publicIdentity: { canonicalAccountId: "acct-spades" },
  } as any);
  assert.deepEqual(spadesSnapshot.friends.map((profile) => profile.handle), ["euchre-player"]);
});
