# Site observability

The public app emits a small anonymous event schema for page views, link clicks, and browser performance metrics. Query strings, hashes, player names, emails, account IDs, cookies, IP addresses, user agents, and full external URLs are not included.

On `1v1tournaments.org` and Netlify deploy previews, events are sent to `/.netlify/functions/site-analytics` with `credentials: omit`. Local development stays network-off unless `EXPO_PUBLIC_SITE_TELEMETRY_ENDPOINT` is configured. Global Privacy Control or Do Not Track disables delivery.

The receiver validates the allowlisted schema again, ignores client timestamps, recomputes Core Web Vital ratings, and stores one anonymous aggregate per UTC day. Concurrent updates use ETag checks with bounded retry while reads use the site's supported cached Blob path. It never stores raw events, so the report can show page views and clicks but cannot claim unique visitors.

Host-approved accounts can review the rolling 30-day report at `/admin/analytics`. The authenticated GET response includes top routes, navigation destinations, daily activity, and Core Web Vital summaries. No provider credential is required in the browser bundle.

To use a different receiver, configure `EXPO_PUBLIC_SITE_TELEMETRY_ENDPOINT` with a same-site path or HTTPS endpoint. The custom receiver must preserve the same privacy contract.

Network polling uses visibility-aware scheduling. Hidden tabs stop refreshing hosted tournament, bracket, signup, player-status, broadcast, and health data, then refresh immediately when the tab becomes visible again.
