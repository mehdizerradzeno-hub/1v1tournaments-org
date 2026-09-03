export const SHARED_ACCOUNT_CODE_QUERY_PARAMETER = 'sharedAccountCode';
export const SHARED_ACCOUNT_LAUNCH_PROTOCOL_VERSION = '2026-08-04';
export const SHARED_ACCOUNT_ENDPOINT = '/.netlify/functions/shared-account';
export const SPADES_NATIVE_CALLBACK_URI = 'spades-freeplay://shared-account-callback';

const SUPPORTED_GAME_AUDIENCES = new Set(['spades', 'euchre', 'gin']);

export class SharedAccountLaunchError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'SharedAccountLaunchError';
    this.code = options.code || 'shared_account_launch_error';
    this.retryable = Boolean(options.retryable);
    this.statusCode = Number(options.statusCode || 0);
  }
}

function normalizeAudience(value) {
  const audience = String(value || '').trim().toLowerCase();
  return SUPPORTED_GAME_AUDIENCES.has(audience) ? audience : '';
}

function parseLaunchUrl(destinationUrl) {
  const value = String(destinationUrl || '').trim();
  if (!value) {
    throw new SharedAccountLaunchError('This game destination is not configured yet.', {
      code: 'destination_unavailable',
    });
  }

  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname) throw new Error('Unsupported URL');
    return url;
  } catch {
    throw new SharedAccountLaunchError('This game launch URL is invalid. Ask the host to check the game destination.', {
      code: 'malformed_destination',
    });
  }
}

async function readJsonResponse(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: text || 'The Account Hub returned an unreadable response.' };
  }
}

export async function issueSharedAccountAuthorization({
  audience: audienceValue,
  fetchImpl = globalThis.fetch,
  redirectUri = '',
  source = '',
  state = '',
}) {
  const audience = normalizeAudience(audienceValue);
  if (!audience) {
    throw new SharedAccountLaunchError('Shared account launch supports only configured games.', {
      code: 'unsupported_audience',
    });
  }
  if (typeof fetchImpl !== 'function') {
    throw new SharedAccountLaunchError('The Account Hub cannot be reached from this device. Try again.', {
      code: 'account_hub_unavailable',
      retryable: true,
    });
  }

  const body = { action: 'issue-game-authorization', audience };
  if (source || redirectUri || state) Object.assign(body, { redirectUri, source, state });
  const response = await fetchImpl(SHARED_ACCOUNT_ENDPOINT, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  const result = await readJsonResponse(response);

  if (!response.ok) {
    throw new SharedAccountLaunchError(
      response.status === 401
        ? 'Sign in to use your shared 1v1 account.'
        : `${result?.error || 'Account authorization could not be issued.'} Try again.`,
      {
        code: result?.code || (response.status === 401 ? 'unauthenticated' : 'authorization_issue_failed'),
        retryable: response.status === 429 || response.status >= 500,
        statusCode: response.status,
      },
    );
  }

  const authorization = result?.authorization;
  if (
    !authorization?.authorizationCode
    || authorization.audience !== audience
    || authorization.protocolVersion !== SHARED_ACCOUNT_LAUNCH_PROTOCOL_VERSION
  ) {
    throw new SharedAccountLaunchError('The Account Hub returned an incompatible authorization. Try again.', {
      code: 'authorization_contract_mismatch',
      retryable: true,
      statusCode: response.status,
    });
  }

  return authorization;
}

export function attachSharedAccountCode(destinationUrl, authorizationCode, nativeCallback = null) {
  if (nativeCallback && nativeCallback.redirectUri !== SPADES_NATIVE_CALLBACK_URI) {
    throw new SharedAccountLaunchError('The native callback is not allowlisted.', {
      code: 'callback_not_allowlisted',
    });
  }
  const url = nativeCallback?.redirectUri
    ? new URL(nativeCallback.redirectUri)
    : parseLaunchUrl(destinationUrl);
  const code = String(authorizationCode || '').trim();
  if (!code) {
    throw new SharedAccountLaunchError('The Account Hub did not provide a launch code. Try again.', {
      code: 'authorization_code_missing',
      retryable: true,
    });
  }

  url.searchParams.set(SHARED_ACCOUNT_CODE_QUERY_PARAMETER, code);
  if (nativeCallback?.state) {
    if (nativeCallback.state.length < 32 || nativeCallback.state.length > 128 || /\s/.test(nativeCallback.state)) {
      throw new SharedAccountLaunchError('The native callback state is invalid.', {
        code: 'callback_state_invalid',
      });
    }
    url.searchParams.set('state', nativeCallback.state);
  }
  return url.toString();
}

export async function prepareSharedAccountLaunch({
  audience: audienceValue,
  destinationUrl,
  fetchImpl = globalThis.fetch,
  requireAccount = false,
  redirectUri = '',
  source = '',
  state = '',
}) {
  const audience = normalizeAudience(audienceValue);
  const destination = parseLaunchUrl(destinationUrl);
  if (!audience) {
    throw new SharedAccountLaunchError('Shared account launch supports only configured games.', {
      code: 'unsupported_audience',
    });
  }

  let authorization;
  try {
    authorization = await issueSharedAccountAuthorization({ audience, fetchImpl, redirectUri, source, state });
  } catch (error) {
    if (error instanceof SharedAccountLaunchError && error.code === 'unauthenticated' && !requireAccount) {
      return {
        audience,
        authorized: false,
        protocolVersion: null,
        url: destinationUrl,
      };
    }
    throw error;
  }

  const nativeCallback = authorization.redirectUri === SPADES_NATIVE_CALLBACK_URI
    && authorization.state === state
    ? { redirectUri: authorization.redirectUri, state: authorization.state }
    : null;
  if ((source || redirectUri || state) && !nativeCallback) {
    throw new SharedAccountLaunchError('The Account Hub returned an incompatible native callback.', {
      code: 'callback_contract_mismatch',
      retryable: true,
    });
  }

  return {
    audience,
    authorized: true,
    expiresAt: authorization.expiresAt,
    protocolVersion: authorization.protocolVersion,
    url: attachSharedAccountCode(destination.toString(), authorization.authorizationCode, nativeCallback),
    ...(nativeCallback || {}),
  };
}

export async function openSharedAccountGame({ openUrl, ...options }) {
  const launch = await prepareSharedAccountLaunch(options);
  if (typeof openUrl !== 'function') return launch;
  await openUrl(launch.url);
  return launch;
}
