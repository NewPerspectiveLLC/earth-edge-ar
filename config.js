// Client feature flags. TEST CONFIG: CONSENT_REQUIRED=false skips the live-tracking consent screen (one-tap join with an
// auto name). To restore the consent screen set this to true AND set CONSENT_REQUIRED=true (or remove it) in Monster's
// server/config.json (or the EEAR CONSENT_REQUIRED env), then restart the server.
export const CONSENT_REQUIRED=false;
