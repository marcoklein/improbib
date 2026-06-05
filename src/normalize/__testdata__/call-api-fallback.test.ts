import { describe, expect, it, mock, afterEach } from "bun:test";
import { callApi } from "../llm-client";

function makeSuccessResponse(content: string, usage?: { prompt_tokens: number; completion_tokens: number }) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ finish_reason: "stop", message: { content } }],
      usage: usage || { prompt_tokens: 100, completion_tokens: 50 },
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

describe("callApi model fallback", () => {
  afterEach(() => {
    mock.restore();
  });

  it("uses primary model successfully", async () => {
    const fakeFetch = mock((_input: string, _init: RequestInit) => {
      return Promise.resolve(makeSuccessResponse('{"result": "ok"}'));
    });
    globalThis.fetch = fakeFetch as unknown as typeof fetch;

    const result = await callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 0);
    expect(result).toBe('{"result": "ok"}');
    expect(fakeFetch).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fakeFetch.mock.calls[0][1].body as string);
    expect(body.model).toBe("model-a");
  });

  it("falls back to second model on HTTP 402 credit exhausted", async () => {
    let callCount = 0;
    globalThis.fetch = mock((_input: string, init: RequestInit) => {
      callCount++;
      const body = JSON.parse(init.body as string);
      if (body.model === "model-a" && callCount <= 1) {
        return Promise.resolve(makeErrorResponse(402, '{"error": "insufficient credits"}'));
      }
      return Promise.resolve(makeSuccessResponse('{"result": "fallback-ok"}'));
    }) as unknown as typeof fetch;

    const result = await callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 0);
    expect(result).toBe('{"result": "fallback-ok"}');
  });

  it("falls back on HTTP 403 with quota keyword", async () => {
    let calls = 0;
    globalThis.fetch = mock((_input: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string);
      if (body.model === "model-a") {
        return Promise.resolve(makeErrorResponse(403, '{"error": "quota exceeded for this model"}'));
      }
      return Promise.resolve(makeSuccessResponse('{"result": "ok"}'));
    }) as unknown as typeof fetch;

    const result = await callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 0);
    expect(result).toBe('{"result": "ok"}');
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("falls back on HTTP 429 with FreeUsageLimitError (actual opencode.ai format)", async () => {
    let calls = 0;
    globalThis.fetch = mock((_input: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string);
      if (body.model === "model-a") {
        return Promise.resolve(makeErrorResponse(429, '{"type":"error","error":{"type":"FreeUsageLimitError","message":"Rate limit exceeded. Please try again later."}}'));
      }
      return Promise.resolve(makeSuccessResponse('{"result": "ok"}'));
    }) as unknown as typeof fetch;

    const result = await callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 0);
    expect(result).toBe('{"result": "ok"}');
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("falls back on HTTP 429 with credit keyword in body", async () => {
    let calls = 0;
    globalThis.fetch = mock((_input: string, init: RequestInit) => {
      calls++;
      const body = JSON.parse(init.body as string);
      if (body.model === "model-a") {
        return Promise.resolve(makeErrorResponse(429, '{"error": "rate limit reached: balance exceeded"}'));
      }
      return Promise.resolve(makeSuccessResponse('{"result": "ok"}'));
    }) as unknown as typeof fetch;

    const result = await callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 0);
    expect(result).toBe('{"result": "ok"}');
    expect(calls).toBeGreaterThanOrEqual(2);
  });

  it("does NOT fall back on HTTP 429 without credit keywords (rate limit)", { timeout: 1000 }, async () => {
    globalThis.fetch = mock((_input: string, _init: RequestInit) => {
      return Promise.resolve(makeErrorResponse(429, "Too many requests, please slow down"));
    }) as unknown as typeof fetch;

    await expect(callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 0))
      .rejects.toThrow("API error 429");
  });

  it("does NOT fall back on HTTP 500 (server error)", async () => {
    globalThis.fetch = mock((_input: string, _init: RequestInit) => {
      return Promise.resolve(makeErrorResponse(500, "Internal server error"));
    }) as unknown as typeof fetch;

    await expect(callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 0))
      .rejects.toThrow("API error 500");
  });

  it("throws after all models exhausted", async () => {
    globalThis.fetch = mock((_input: string, _init: RequestInit) => {
      return Promise.resolve(makeErrorResponse(402, "Insufficient credits"));
    }) as unknown as typeof fetch;

    await expect(callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 0))
      .rejects.toThrow("API error 402");
  });

  it("retries on HTTP 503 within same model", { timeout: 10000 }, async () => {
    let calls = 0;
    globalThis.fetch = mock((_input: string, _init: RequestInit) => {
      calls++;
      if (calls === 1) {
        return Promise.resolve(makeErrorResponse(503, "Service unavailable"));
      }
      return Promise.resolve(makeSuccessResponse('{"result": "recovered"}'));
    }) as unknown as typeof fetch;

    const result = await callApi("test-key", ["model-a", "model-b"], "system", "user", 1000, 1);
    expect(result).toBe('{"result": "recovered"}');
  });

  it("uses one model when only one provided", async () => {
    let calls = 0;
    globalThis.fetch = mock((_input: string, _init: RequestInit) => {
      calls++;
      return calls === 1
        ? Promise.resolve(makeErrorResponse(402, "Insufficient credits"))
        : Promise.resolve(makeSuccessResponse('{"result": "ok"}'));
    }) as unknown as typeof fetch;

    await expect(callApi("test-key", ["only-model"], "system", "user", 1000, 0))
      .rejects.toThrow("API error 402");
  });
});
