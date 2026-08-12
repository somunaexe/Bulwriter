export const environment = {
  production: false,
  apiUrl: 'https://redesigned-fishstick-6649qpwg47q25pv9-8080.app.github.dev/api',
  wsUrl: 'wss://redesigned-fishstick-6649qpwg47q25pv9-8080.app.github.dev/ws',
  clerkPublishableKey: 'pk_test_d2FudGVkLWdlbGRpbmctOTEuY2xlcmsuYWNjb3VudHMuZGV2JA',
  // Left blank in dev on purpose — errors from local development aren't
  // worth tracking. Sentry DSNs are public identifiers (like Clerk's
  // publishable key above), safe to ship in client code.
  sentryDsn: '',
};