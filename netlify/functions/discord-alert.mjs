import { cleanText } from './_account-utils.mjs';
import { requireTournamentAdmin } from './_host-auth.mjs';

const headers = {
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Origin': '*',
  'Content-Type': 'application/json',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers,
    body: JSON.stringify(body),
  };
}

function configuredWebhookUrl() {
  return cleanText(process.env.DISCORD_WEBHOOK_URL);
}

function cleanDiscordMessage(value) {
  return cleanText(value).slice(0, 1900);
}

export async function handler(event) {
  if (event.httpMethod === 'OPTIONS') {
    return json(204, {});
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Use POST to send a Discord alert.' });
  }

  const adminCheck = await requireTournamentAdmin(event);

  if (adminCheck.error) {
    return json(adminCheck.error.statusCode, { error: adminCheck.error.message });
  }

  const webhookUrl = configuredWebhookUrl();

  if (!webhookUrl) {
    return json(503, { error: 'DISCORD_WEBHOOK_URL is not configured on Netlify.' });
  }

  let payload;

  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'Discord alert payload must be valid JSON.' });
  }

  const message = cleanDiscordMessage(payload.message);

  if (!message) {
    return json(400, { error: 'Add a Discord message before sending.' });
  }

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content: message,
        allowed_mentions: {
          parse: [],
        },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error('Discord webhook failed', response.status, text);
      return json(502, { error: 'Discord did not accept the alert.' });
    }

    return json(200, {
      ok: true,
      hostAuth: adminCheck.method,
      sentAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Discord alert send failed', error);
    return json(500, { error: 'Discord alert could not be sent.' });
  }
}
