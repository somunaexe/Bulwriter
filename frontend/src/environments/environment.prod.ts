export const environment = {
  production: true,
  apiUrl: 'https://bulwriter-production.up.railway.app/api',
  wsUrl: 'wss://bulwriter-production.up.railway.app/ws',
  clerkPublishableKey: 'pk_test_d2FudGVkLWdlbGRpbmctOTEuY2xlcmsuYWNjb3VudHMuZGV2JA',
  // Empty until a Sentry project exists — see main.ts, which only calls
  // Sentry.init() when this is set. Fill in once you have a DSN.
  sentryDsn: '',
};