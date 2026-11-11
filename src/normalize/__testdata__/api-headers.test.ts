import { afterEach, describe, expect, it, mock } from "bun:test";
import { buildApiHeaders, callApi } from "../llm-client";

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

const originalSession = process.env.NORMALIZE_API_SESSION;
const originalFetch = globalThis.fetch;

afterEach(() => {
  mock.restore();
  globalThis.fetch = originalFetch;
  if (originalSession === undefined) delete process.env.NORMALIZE_API_SESSION;
  else process.env.NORMALIZE_API_SESSION = originalSession;
});

describe("buildApiHeaders", () => {
  it("sends x-opencode-session when a session id is configured", () => {
    const headers = buildApiHeaders("test-key", "ses_123");

    expect(headers["x-opencode-session"]).toBe("ses_123");
    expect(headers.Authorization).toBe("Bearer test-key");
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("omits x-opencode-session without a session id", () => {
    expect(buildApiHeaders("test-key", undefined)).not.toHaveProperty(
      "x-opencode-session"
    );
    expect(buildApiHeaders("test-key", "   ")).not.toHaveProperty(
      "x-opencode-session"
    );
  });
});

describe("callApi session header", () => {
  it("sends the header when NORMALIZE_API_SESSION is set", async () => {
    process.env.NORMALIZE_API_SESSION = "ses_abc";
    const fakeFetch = mock((_input: string, _init: RequestInit) =>
      Promise.resolve(makeSuccessResponse('{"result": "ok"}'))
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await callApi("test-key", ["model-a"], "system", "user", 1000, 0);

    const init = fakeFetch.mock.calls[0][1];
    const headers = init.headers as Record<string, string>;
    expect(headers["x-opencode-session"]).toBe("ses_abc");
  });

  it("keeps the header out when NORMALIZE_API_SESSION is unset", async () => {
    delete process.env.NORMALIZE_API_SESSION;
    const fakeFetch = mock((_input: string, _init: RequestInit) =>
      Promise.resolve(makeSuccessResponse('{"result": "ok"}'))
    );
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    await callApi("test-key", ["model-a"], "system", "user", 1000, 0);

    const init = fakeFetch.mock.calls[0][1];
    const headers = init.headers as Record<string, string>;
    expect(headers).not.toHaveProperty("x-opencode-session");
  });
});
