import { afterEach, describe, expect, it, mock } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  ApiCredential,
  DEFAULT_REFRESH_ENDPOINT,
  loadApiCredential,
  readStoredCredential,
  resetDefaultApiCredential,
} from "../api-credential";
import { buildApiHeaders, callApiDetailed } from "../llm-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  mock.restore();
  resetDefaultApiCredential();
});

function makeSuccessResponse(content: string) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: { prompt_tokens: 100, completion_tokens: 50 },
    }),
  };
}

function makeErrorResponse(status: number, body: string) {
  return {
    ok: false,
    status,
    text: async () => body,
    statusText: body.slice(0, 100),
  };
}

function makeTokenResponse(payload: unknown, status = 200) {
  return {
    ok: status < 400,
    status,
    text: async () => JSON.stringify(payload),
  };
}

describe("buildApiHeaders", () => {
  it("keeps the bearer and session header shape unchanged", () => {
    expect(buildApiHeaders("test-key", "ses_123")).toEqual({
      Authorization: "Bearer test-key",
      "Content-Type": "application/json",
      "x-opencode-session": "ses_123",
    });
  });
});

describe("refresh decision", () => {
  it("refreshes only a known-expired credential that has a refresh token", () => {
    const expired = new ApiCredential({
      accessToken: "old",
      refreshToken: "refresh",
      expiresAt: 1_000,
      now: () => 2_000,
    });
    const fresh = new ApiCredential({
      accessToken: "old",
      refreshToken: "refresh",
      expiresAt: 3_000,
      now: () => 2_000,
    });
    const withoutRefreshToken = new ApiCredential({
      accessToken: "old",
      expiresAt: 1_000,
      now: () => 2_000,
    });
    const withoutExpiry = new ApiCredential({
      accessToken: "old",
      refreshToken: "refresh",
      now: () => 2_000,
    });

    expect(expired.needsRefresh()).toBe(true);
    expect(fresh.needsRefresh()).toBe(false);
    expect(withoutRefreshToken.needsRefresh()).toBe(false);
    expect(withoutExpiry.needsRefresh()).toBe(false);
  });

  it("refreshes proactively before the first request when the token is expired", async () => {
    const urls: string[] = [];
    const fakeFetch = mock((url: string, _init: RequestInit) => {
      urls.push(url);
      if (url === DEFAULT_REFRESH_ENDPOINT) {
        return Promise.resolve(
          makeTokenResponse({
            access_token: "new-token",
            refresh_token: "rotated",
            expires_in: 3600,
          })
        );
      }
      return Promise.resolve(makeSuccessResponse('{"result": "ok"}'));
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const credential = new ApiCredential({
      accessToken: "old-token",
      refreshToken: "refresh",
      expiresAt: 1_000,
      now: () => 2_000,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const result = await callApiDetailed(
      "old-token",
      ["model-a"],
      "system",
      "user",
      1000,
      0,
      false,
      true,
      credential
    );

    expect(result.text).toBe('{"result": "ok"}');
    expect(urls[0]).toBe(DEFAULT_REFRESH_ENDPOINT);
    expect(urls).toHaveLength(2);
    const apiInit = fakeFetch.mock.calls[1][1];
    expect((apiInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer new-token"
    );
  });
});

describe("callApi credential recovery", () => {
  it("refreshes once and retries the call once on 401", async () => {
    let apiCalls = 0;
    let refreshCalls = 0;
    const fakeFetch = mock((url: string, _init: RequestInit) => {
      if (url === DEFAULT_REFRESH_ENDPOINT) {
        refreshCalls++;
        return Promise.resolve(
          makeTokenResponse({
            access_token: "new-token",
            refresh_token: "rotated",
            expires_in: 3600,
          })
        );
      }
      apiCalls++;
      if (apiCalls === 1) {
        return Promise.resolve(
          makeErrorResponse(401, '{"error":"api_key_expired"}')
        );
      }
      return Promise.resolve(makeSuccessResponse('{"result": "recovered"}'));
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const credential = new ApiCredential({
      accessToken: "old-token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    const result = await callApiDetailed(
      "old-token",
      ["model-a"],
      "system",
      "user",
      1000,
      0,
      false,
      true,
      credential
    );

    expect(result.text).toBe('{"result": "recovered"}');
    expect(apiCalls).toBe(2);
    expect(refreshCalls).toBe(1);
    const retryInit = fakeFetch.mock.calls[2][1];
    expect((retryInit.headers as Record<string, string>).Authorization).toBe(
      "Bearer new-token"
    );
  });

  it("throws a clear error when the refreshed token is still rejected", async () => {
    let apiCalls = 0;
    let refreshCalls = 0;
    const fakeFetch = mock((url: string, _init: RequestInit) => {
      if (url === DEFAULT_REFRESH_ENDPOINT) {
        refreshCalls++;
        return Promise.resolve(
          makeTokenResponse({
            access_token: "new-token",
            refresh_token: "rotated",
            expires_in: 3600,
          })
        );
      }
      apiCalls++;
      return Promise.resolve(
        makeErrorResponse(401, '{"error":"api_key_expired"}')
      );
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const credential = new ApiCredential({
      accessToken: "old-token",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    await expect(
      callApiDetailed(
        "old-token",
        ["model-a"],
        "system",
        "user",
        1000,
        0,
        false,
        true,
        credential
      )
    ).rejects.toThrow(/credential refresh did not restore access/);

    // Never loops: one refresh, one retry.
    expect(refreshCalls).toBe(1);
    expect(apiCalls).toBe(2);
  });

  it("keeps current behaviour when no refresh token is configured", async () => {
    let apiCalls = 0;
    const fakeFetch = mock((_url: string, _init: RequestInit) => {
      apiCalls++;
      return Promise.resolve(
        makeErrorResponse(401, '{"error":"api_key_expired"}')
      );
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const credential = new ApiCredential({ accessToken: "only-key" });

    await expect(
      callApiDetailed(
        "only-key",
        ["model-a"],
        "system",
        "user",
        1000,
        0,
        false,
        true,
        credential
      )
    ).rejects.toThrow("API error 401");
    expect(apiCalls).toBe(1);
  });

  it("surfaces a failed refresh instead of returning stale data", async () => {
    let refreshCalls = 0;
    const fakeFetch = mock((url: string, _init: RequestInit) => {
      if (url === DEFAULT_REFRESH_ENDPOINT) {
        refreshCalls++;
        return Promise.resolve(
          makeTokenResponse(
            {
              _tag: "OAuthTokenError",
              error: "invalid_grant",
              error_description: "The refresh token is invalid",
            },
            400
          )
        );
      }
      return Promise.resolve(
        makeErrorResponse(401, '{"error":"api_key_expired"}')
      );
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const credential = new ApiCredential({
      accessToken: "old-token",
      refreshToken: "invalid-refresh",
      expiresAt: Date.now() + 60_000,
      fetchImpl: fakeFetch as unknown as typeof fetch,
    });

    await expect(
      callApiDetailed(
        "old-token",
        ["model-a"],
        "system",
        "user",
        1000,
        0,
        false,
        true,
        credential
      )
    ).rejects.toThrow(
      /Credential refresh failed: invalid_grant \(The refresh token is invalid\)/
    );
    expect(refreshCalls).toBe(1);
  });
});

describe("credential persistence", () => {
  it("persists the rotated credential and prefers the file on reload", async () => {
    const dir = mkdtempSync(join(tmpdir(), "improbib-credential-"));
    const filePath = join(dir, ".opencode-credential.json");

    try {
      const fakeFetch = mock((_url: string, _init: RequestInit) =>
        Promise.resolve(
          makeTokenResponse({
            access_token: "rotated-access",
            refresh_token: "rotated-refresh",
            expires_in: 60,
          })
        )
      );

      const credential = new ApiCredential({
        accessToken: "env-access",
        refreshToken: "env-refresh",
        expiresAt: 1_000,
        filePath,
        now: () => 5_000,
        fetchImpl: fakeFetch as unknown as typeof fetch,
      });
      await credential.refresh();

      expect(readStoredCredential(filePath)).toMatchObject({
        accessToken: "rotated-access",
        refreshToken: "rotated-refresh",
        expiresAt: 65_000,
      });

      const loaded = loadApiCredential(
        {
          OPENCODE_GO_API_KEY: "env-access",
          NORMALIZE_API_REFRESH_TOKEN: "env-refresh",
        },
        { filePath }
      );
      expect(loaded?.accessToken).toBe("rotated-access");
      expect(loaded?.refreshToken).toBe("rotated-refresh");
      expect(loaded?.expiresAt).toBe(65_000);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
