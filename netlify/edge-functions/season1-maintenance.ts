export default function maintenanceBarrier(): Response {
  return new Response('1V1 Tournaments is temporarily unavailable for scheduled maintenance.', {
    status: 503,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'Content-Type': 'text/plain; charset=utf-8',
      'Retry-After': '300',
    },
  });
}
