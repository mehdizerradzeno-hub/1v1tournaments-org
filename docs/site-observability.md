# Site observability

The public app emits a small anonymous event schema for page views, link clicks, and browser performance metrics. Query strings, hashes, player names, emails, account IDs, and full external URLs are not included.

By default, events are dispatched only as the browser event `one-v-one-tournaments:analytics`; nothing is sent over the network and no cookies or persistent identifiers are created.

To deliver events later, configure `EXPO_PUBLIC_SITE_TELEMETRY_ENDPOINT` with a same-site path or HTTPS endpoint. Delivery uses `credentials: omit`. The receiver should accept JSON and retain only aggregate data. No provider credential is required in the browser bundle.

Network polling uses visibility-aware scheduling. Hidden tabs stop refreshing hosted tournament, bracket, signup, player-status, broadcast, and health data, then refresh immediately when the tab becomes visible again.
