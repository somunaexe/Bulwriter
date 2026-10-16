import crypto from "node:crypto";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";

// A minimal, single-user OAuth 2.1 authorization server, so claude.ai's
// custom connector flow has a real login screen (MCP_OAUTH_PASSWORD) between
// "add connector" and this server actually being allowed to act on your
// Bulwriter account. Everything lives in memory: registered clients,
// authorization codes, and issued tokens all vanish on a restart, so after a
// Railway redeploy you may need to remove and re-add the connector in
// claude.ai. Acceptable for a personal tool with one user; not a general
// multi-tenant OAuth implementation.

const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
const AUTH_CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes, single use

type StoredCode = {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  resource?: string;
  expiresAt: number;
};

type StoredToken = {
  clientId: string;
  scopes: string[];
  resource?: string;
  expiresAt: number; // seconds since epoch
};

type StoredRefreshToken = {
  clientId: string;
  scopes: string[];
  resource?: string;
};

function randomToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

function passwordMatches(candidate: string, expected: string): boolean {
  const a = crypto.createHash("sha256").update(candidate).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

function loginPage(opts: {
  action: string;
  hidden: Record<string, string | undefined>;
  error?: string;
}): string {
  const hiddenInputs = Object.entries(opts.hidden)
    .filter(([, v]) => v !== undefined)
    .map(([k, v]) => `<input type="hidden" name="${k}" value="${escapeHtml(v!)}">`)
    .join("\n");

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>Sign in — Bulwriter MCP</title>
  <style>
    body { font-family: system-ui, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #0f0f10; color: #eee; }
    form { background: #1a1a1c; padding: 2rem; border-radius: 12px; width: 320px; box-shadow: 0 4px 24px rgba(0,0,0,0.4); }
    h1 { font-size: 1.1rem; margin: 0 0 1rem; }
    p.sub { color: #999; font-size: 0.85rem; margin: 0 0 1.5rem; }
    input[type="password"] { width: 100%; padding: 0.6rem; border-radius: 6px; border: 1px solid #333; background: #111; color: #eee; box-sizing: border-box; margin-bottom: 1rem; }
    button { width: 100%; padding: 0.6rem; border-radius: 6px; border: none; background: #5b5bd6; color: white; font-weight: 600; cursor: pointer; }
    .error { color: #f87171; font-size: 0.85rem; margin: -0.5rem 0 1rem; }
  </style>
</head>
<body>
  <form method="POST" action="${escapeHtml(opts.action)}">
    <h1>Bulwriter MCP</h1>
    <p class="sub">Authorize this app to access your Bulwriter account.</p>
    ${opts.error ? `<div class="error">${escapeHtml(opts.error)}</div>` : ""}
    ${hiddenInputs}
    <input type="password" name="password" placeholder="Password" autofocus required>
    <button type="submit">Authorize</button>
  </form>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export class BulwriterOAuthProvider implements OAuthServerProvider {
  private clients = new Map<string, OAuthClientInformationFull>();
  private codes = new Map<string, StoredCode>();
  private accessTokens = new Map<string, StoredToken>();
  private refreshTokens = new Map<string, StoredRefreshToken>();
  private password: string;

  constructor(password: string) {
    if (!password) {
      throw new Error("BulwriterOAuthProvider requires a non-empty password (MCP_OAUTH_PASSWORD).");
    }
    this.password = password;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (clientId) => this.clients.get(clientId),
      registerClient: (client) => {
        const full = client as OAuthClientInformationFull;
        this.clients.set(full.client_id, full);
        return full;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    // The SDK's authorizationHandler mounts both GET (show the form) and
    // POST (submit the form) at the same route and always calls this
    // method — `res.req` is how we tell which one we're in.
    const req = res.req!;
    const hidden = {
      client_id: client.client_id,
      redirect_uri: params.redirectUri,
      state: params.state,
      code_challenge: params.codeChallenge,
      code_challenge_method: "S256",
      response_type: "code",
      scope: params.scopes?.join(" "),
      resource: params.resource?.toString(),
    };

    if (req.method !== "POST") {
      res.status(200).type("html").send(loginPage({ action: req.originalUrl, hidden }));
      return;
    }

    const submitted = typeof req.body?.password === "string" ? req.body.password : "";
    if (!passwordMatches(submitted, this.password)) {
      res.status(401).type("html").send(loginPage({ action: req.originalUrl, hidden, error: "Wrong password." }));
      return;
    }

    const code = randomToken();
    this.codes.set(code, {
      clientId: client.client_id,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      scopes: params.scopes ?? [],
      resource: params.resource?.toString(),
      expiresAt: Date.now() + AUTH_CODE_TTL_MS,
    });

    const redirect = new URL(params.redirectUri);
    redirect.searchParams.set("code", code);
    if (params.state) redirect.searchParams.set("state", params.state);
    res.redirect(302, redirect.toString());
  }

  async challengeForAuthorizationCode(client: OAuthClientInformationFull, authorizationCode: string): Promise<string> {
    const stored = this.codes.get(authorizationCode);
    if (!stored || stored.clientId !== client.client_id || stored.expiresAt < Date.now()) {
      throw new InvalidGrantError("Invalid, expired, or already-used authorization code.");
    }
    return stored.codeChallenge;
  }

  async exchangeAuthorizationCode(
    client: OAuthClientInformationFull,
    authorizationCode: string,
    _codeVerifier?: string,
    redirectUri?: string
  ): Promise<OAuthTokens> {
    const stored = this.codes.get(authorizationCode);
    if (!stored || stored.clientId !== client.client_id || stored.expiresAt < Date.now()) {
      throw new InvalidGrantError("Invalid, expired, or already-used authorization code.");
    }
    if (redirectUri && redirectUri !== stored.redirectUri) {
      throw new InvalidGrantError("redirect_uri does not match the one used to request this code.");
    }
    this.codes.delete(authorizationCode); // single use

    return this.issueTokens(client.client_id, stored.scopes, stored.resource);
  }

  async exchangeRefreshToken(
    client: OAuthClientInformationFull,
    refreshToken: string,
    scopes?: string[]
  ): Promise<OAuthTokens> {
    const stored = this.refreshTokens.get(refreshToken);
    if (!stored || stored.clientId !== client.client_id) {
      throw new InvalidGrantError("Invalid refresh token.");
    }
    this.refreshTokens.delete(refreshToken); // rotate
    return this.issueTokens(client.client_id, scopes ?? stored.scopes, stored.resource);
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const stored = this.accessTokens.get(token);
    if (!stored) {
      throw new InvalidTokenError("Access token not recognized — it may have expired, or the server restarted.");
    }
    if (stored.expiresAt < Date.now() / 1000) {
      this.accessTokens.delete(token);
      throw new InvalidTokenError("Access token has expired.");
    }
    return {
      token,
      clientId: stored.clientId,
      scopes: stored.scopes,
      expiresAt: stored.expiresAt,
      resource: stored.resource ? new URL(stored.resource) : undefined,
    };
  }

  private issueTokens(clientId: string, scopes: string[], resource?: string): OAuthTokens {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    const expiresAt = Math.floor(Date.now() / 1000) + ACCESS_TOKEN_TTL_SECONDS;

    this.accessTokens.set(accessToken, { clientId, scopes, resource, expiresAt });
    this.refreshTokens.set(refreshToken, { clientId, scopes, resource });

    return {
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL_SECONDS,
      refresh_token: refreshToken,
      scope: scopes.join(" ") || undefined,
    };
  }
}
