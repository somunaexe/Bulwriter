export const environment = {
  production: true,
  apiUrl: 'https://bulwriter-production.up.railway.app/api',
  wsUrl: 'wss://bulwriter-production.up.railway.app/ws',
  clerkPublishableKey: 'pk_test_d2FudGVkLWdlbGRpbmctOTEuY2xlcmsuYWNjb3VudHMuZGV2JA',
  // Empty until an Angular/JavaScript Sentry project exists (the DSN
  // that landed here briefly was actually for the Go project — wrong
  // platform, would've mangled frontend stack traces). See main.ts,
  // which only calls Sentry.init() when this is set.
  sentryDsn: '',
};