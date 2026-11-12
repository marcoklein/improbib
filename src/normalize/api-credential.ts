import { chmodSync, existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * The OpenCode Console authorization server, discovered from
 * `https://opencode.ai/console/.well-known/oauth-authorization-server`.
 * The public client id is the CIMD document itself
 * (`https://opencode.ai/oauth/opencode/client.json`), so no client secret is
 * involved (`token_endpoint_auth_methods_supported: ["none"]`).
 */
export const DEFAULT_REFRESH_ENDPOINT =
  "https://opencode.ai/console/auth/oauth/token";
export const DEFAULT_CLIENT_ID = "https://opencode.ai/oauth/opencode/client.json";

/** Written under the storage directory and preferred over the environment. */
export const CREDENTIAL_FILE_NAME = ".opencode-credential.json";

/**
 * A refresh that could not produce a usable credential. Callers must treat
 * this as fatal instead of falling back to cached content: continuing would
 * silently publish stale data with an expired credential.
 */
export class CredentialRefreshError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CredentialRefreshError";
  }
}

export interface StoredCredential {
  accessToken: string;
  refreshToken?: string;
  /** Epoch milliseconds. */
  expiresAt?: number;
  updatedAt?: string;
}

export interface ApiCredentialOptions {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshEndpoint?: string;
  clientId?: string;
  /** Omit to keep the credential in memory only. */
  filePath?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export interface LoadCredentialOptions {
  filePath?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export function credentialFilePath(
  storagePath: string = process.env.STORAGE_PATH || process.cwd()
): string {
  return join(storagePath, CREDENTIAL_FILE_NAME);
}

/** Accepts epoch milliseconds, numeric seconds or an ISO timestamp. */
export function parseExpiresAt(value: unknown): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string" || !value.trim()) return undefined;

  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * Reads a credential written by this module. The `value` fallback keeps files
 * in the shape of `opencode auth export` readable.
 */
export function readStoredCredential(filePath: string): StoredCredential | null {
  if (!existsSync(filePath)) return null;

  try {
    const raw = JSON.parse(readFileSync(filePath, "utf8")) as Record<string, any>;
    const value = raw.value && typeof raw.value === "object" ? raw.value : {};
    const accessToken =
      typeof raw.accessToken === "string"
        ? raw.accessToken
        : typeof raw.access === "string"
          ? raw.access
          : typeof value.access === "string"
            ? value.access
            : "";
    if (!accessToken.trim()) return null;

    const refreshToken =
      typeof raw.refreshToken === "string"
        ? raw.refreshToken
        : typeof raw.refresh === "string"
          ? raw.refresh
          : typeof value.refresh === "string"
            ? value.refresh
            : undefined;

    return {
      accessToken,
      refreshToken: refreshToken?.trim() || undefined,
      expiresAt: parseExpiresAt(raw.expiresAt ?? raw.expires ?? value.expires),
      updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    };
  } catch {
    // A corrupt credential file must not take the pipeline down; fall back to
    // the environment instead.
    return null;
  }
}

/** Atomic write with owner-only permissions. */
export function writeStoredCredential(
  filePath: string,
  credential: StoredCredential
): void {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.tmp`;
  const body = `${JSON.stringify(credential, null, 2)}\n`;
  writeFileSync(tempPath, body, { mode: 0o600 });
  renameSync(tempPath, filePath);
  try {
    chmodSync(filePath, 0o600);
  } catch {
    // Best effort; some filesystems do not support chmod.
  }
}

function expiresAtFromTokenResponse(payload: any, now: number): number | undefined {
  if (typeof payload?.expires_in === "number" && Number.isFinite(payload.expires_in)) {
    return now + payload.expires_in * 1000;
  }
  const explicit = parseExpiresAt(payload?.expires_at ?? payload?.expires);
  if (explicit === undefined) return undefined;
  // OAuth servers commonly report seconds; our own file uses milliseconds.
  return explicit < 1_000_000_000_000 ? explicit * 1000 : explicit;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Whether an API response means "this credential is no longer accepted".
 * The Go gateway reports an expired key as `api_key_expired` (sometimes with a
 * 403 instead of a 401), so the body is inspected as well as the status.
 */
export function isAuthenticationError(status: number, body: string): boolean {
  if (status === 401) return true;
  return /api_key_expired|invalid_token|token[_\s-]?expired/i.test(body);
}

/**
 * The current extraction credential, with optional refresh support.
 *
 * A refresh is attempted at most once per caller: `refresh()` deduplicates
 * concurrent calls through an in-flight promise, so a burst of parallel
 * extractions cannot rotate the refresh token several times.
 */
export class ApiCredential {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  readonly refreshEndpoint: string;
  readonly clientId: string;
  readonly filePath?: string;

  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private refreshInFlight: Promise<void> | null = null;

  constructor(options: ApiCredentialOptions) {
    this.accessToken = options.accessToken;
    this.refreshToken = options.refreshToken?.trim() || undefined;
    this.expiresAt = options.expiresAt;
    this.refreshEndpoint = options.refreshEndpoint || DEFAULT_REFRESH_ENDPOINT;
    this.clientId = options.clientId || DEFAULT_CLIENT_ID;
    this.filePath = options.filePath;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? Date.now;
  }

  canRefresh(): boolean {
    return Boolean(this.refreshToken);
  }

  isExpired(): boolean {
    return this.expiresAt !== undefined && this.now() >= this.expiresAt;
  }

  /** Only a credential with a refresh token can be renewed. */
  needsRefresh(): boolean {
    return this.canRefresh() && this.isExpired();
  }

  async refresh(): Promise<void> {
    if (!this.canRefresh()) {
      throw new CredentialRefreshError(
        "Credential refresh failed: no refresh token configured. Set NORMALIZE_API_REFRESH_TOKEN."
      );
    }

    if (!this.refreshInFlight) {
      this.refreshInFlight = this.performRefresh().finally(() => {
        this.refreshInFlight = null;
      });
    }
    return this.refreshInFlight;
  }

  private async performRefresh(): Promise<void> {
    const body = new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: this.refreshToken!,
      client_id: this.clientId,
    });

    let response: Response;
    try {
      response = await this.fetchImpl(this.refreshEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: body.toString(),
      });
    } catch (error) {
      throw new CredentialRefreshError(
        `Credential refresh failed: could not reach ${this.refreshEndpoint}: ${errorMessage(error)}. ` +
          "Re-authenticate with `opencode auth login` and update NORMALIZE_API_REFRESH_TOKEN."
      );
    }

    const text = await response.text().catch(() => "");
    let payload: any = null;
    try {
      payload = text ? JSON.parse(text) : null;
    } catch {
      payload = null;
    }

    if (!response.ok || payload?.error) {
      const code = payload?.error || `HTTP ${response.status}`;
      const description = payload?.error_description
        ? ` (${payload.error_description})`
        : "";
      throw new CredentialRefreshError(
        `Credential refresh failed: ${code}${description}. ` +
          "Re-authenticate with `opencode auth login` and update NORMALIZE_API_REFRESH_TOKEN."
      );
    }

    if (typeof payload?.access_token !== "string" || !payload.access_token.trim()) {
      throw new CredentialRefreshError(
        `Credential refresh failed: ${this.refreshEndpoint} returned no access_token.`
      );
    }

    const now = this.now();
    this.accessToken = payload.access_token;
    if (
      typeof payload.refresh_token === "string" &&
      payload.refresh_token.trim()
    ) {
      // Providers may rotate the refresh token. Keep the old one when the
      // response omits it, which is also allowed by OAuth.
      this.refreshToken = payload.refresh_token;
    }
    this.expiresAt = expiresAtFromTokenResponse(payload, now);
    this.persist();
  }

  private persist(): void {
    if (!this.filePath) return;
    writeStoredCredential(this.filePath, {
      accessToken: this.accessToken,
      refreshToken: this.refreshToken,
      expiresAt: this.expiresAt,
      updatedAt: new Date(this.now()).toISOString(),
    });
  }
}

/**
 * Builds the credential from the environment, then overlays the persisted
 * file. The file wins so a rotated refresh token survives a restart; a field
 * missing from the file still falls back to the environment.
 */
export function loadApiCredential(
  env: Record<string, string | undefined> = process.env,
  options: LoadCredentialOptions = {}
): ApiCredential | null {
  const filePath = options.filePath ?? credentialFilePath(env.STORAGE_PATH);
  const stored = readStoredCredential(filePath);

  const envAccessToken = (
    env.OPENCODE_GO_API_KEY ||
    env.OPENCODE_API_KEY ||
    ""
  ).trim();
  const envRefreshToken = env.NORMALIZE_API_REFRESH_TOKEN?.trim() || undefined;
  const envExpiresAt = parseExpiresAt(env.NORMALIZE_API_EXPIRES_AT);

  const accessToken = stored?.accessToken || envAccessToken;
  if (!accessToken) return null;

  return new ApiCredential({
    accessToken,
    refreshToken: stored?.refreshToken || envRefreshToken,
    expiresAt: stored?.expiresAt ?? envExpiresAt,
    refreshEndpoint:
      env.NORMALIZE_API_REFRESH_ENDPOINT?.trim() || DEFAULT_REFRESH_ENDPOINT,
    clientId: env.NORMALIZE_API_CLIENT_ID?.trim() || DEFAULT_CLIENT_ID,
    filePath,
    fetchImpl: options.fetchImpl,
    now: options.now,
  });
}

let defaultCredential: ApiCredential | null | undefined;

/** Lazily loaded singleton used by the extraction client. */
export function getDefaultApiCredential(): ApiCredential | null {
  if (defaultCredential === undefined) {
    defaultCredential = loadApiCredential();
  }
  return defaultCredential;
}

/** Test hook: forces the next access to re-read the environment and file. */
export function resetDefaultApiCredential(): void {
  defaultCredential = undefined;
}
