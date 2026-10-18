/**
 * Keep the native Netlify Web API runtime's Blobs context intact. The legacy
 * connectLambda adapter replaces that context without its uncached edge URL,
 * which makes the SDK reject strong reads before making a storage request.
 * Only translate the existing JSON endpoint contract, never storage context.
 */
export async function handleNetlifyWebRequest(request, handleEvent) {
  const url = new URL(request.url);
  const event = {
    httpMethod: request.method,
    headers: Object.fromEntries(request.headers.entries()),
    queryStringParameters: Object.fromEntries(url.searchParams.entries()),
    body: ['GET', 'HEAD'].includes(request.method) ? null : await request.text(),
    isBase64Encoded: false,
  };
  const result = await handleEvent(event);
  const headers = new Headers(result.headers || {});
  for (const [name, values] of Object.entries(result.multiValueHeaders || {})) {
    headers.delete(name);
    for (const value of values) headers.append(name, value);
  }
  for (const cookie of result.cookies || []) headers.append('Set-Cookie', cookie);
  return new Response([204, 205, 304].includes(result.statusCode) ? null : result.body ?? '', {
    status: result.statusCode,
    headers,
  });
}
