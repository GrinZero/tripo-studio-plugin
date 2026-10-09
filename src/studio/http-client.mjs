import { TripoError } from "../errors.mjs";
import { sanitizeMessage } from "../redact.mjs";
import { apiEnvelopeSchema } from "./schemas.mjs";

const MAX_JSON_RESPONSE_BYTES = 2 * 1024 * 1024;
const INSUFFICIENT_CREDITS_REMOTE_CODE = 2010;

function remoteMessage(value, code) {
  return sanitizeMessage(value.message ?? value.msg ?? `Tripo Studio returned code ${code}.`).slice(0, 500);
}

function remoteApiError(envelope) {
  if (envelope.code === INSUFFICIENT_CREDITS_REMOTE_CODE) {
    return new TripoError("INSUFFICIENT_CREDITS", "Tripo Studio credits are insufficient; the remote task was not accepted.", {
      details: { remote_code: envelope.code },
      retryable: false,
      safeToRetryPaidOperation: false,
      submissionState: "not_submitted",
      nextAction: "top_up_or_change_request",
      stage: "remote_api"
    });
  }
  return new TripoError("REMOTE_API_ERROR", remoteMessage(envelope, envelope.code), {
    details: { remote_code: envelope.code },
    retryable: false,
    safeToRetryPaidOperation: false,
    stage: "remote_api"
  });
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readJsonResponse(response) {
  const contentLength = response.headers.get("content-length");
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > MAX_JSON_RESPONSE_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio returned an unexpectedly large JSON response.", { stage: "response_decode" });
  }
  if (!response.body) return "";
  const reader = response.body.getReader();
  const chunks = [];
  let bytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_JSON_RESPONSE_BYTES) {
        await reader.cancel("response size limit exceeded");
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio returned an unexpectedly large JSON response.", { stage: "response_decode" });
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const combined = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(combined);
}

export class StudioHttpClient {
  #config;
  #session;
  #fetch;
  // onAuthFailure(identity) → refresh the persisted session headlessly, then
  // the request is retried once with the new identity. Wired by runtime.
  #authRecovery;

  constructor(config, session, options = {}) {
    this.#config = config;
    this.#session = session;
    this.#fetch = options.fetch ?? fetch;
    this.#authRecovery = options.authRecovery;
  }

  setAuthRecovery(recovery) {
    this.#authRecovery = recovery;
  }

  async request(request, parseData) {
    const attempts = request.retrySafe ? 2 : 1;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await this.#requestOnce(request, parseData);
      } catch (error) {
        lastError = error;
        if (error instanceof TripoError && (error.code === "AUTH_EXPIRED" || error.code === "AUTH_REQUIRED") && this.#authRecovery && attempt === 1) {
          // Headless refresh: no window, no user interaction. If it fails the
          // caller gets the auth error verbatim.
          try {
            await this.#authRecovery.recover({ reason: error.code === "AUTH_REQUIRED" ? "auth_required" : "auth_expired" });
          } catch {
            throw error;
          }
          try {
            return await this.#requestOnce(request, parseData);
          } catch (retryError) {
            throw retryError;
          }
        }
        const retryable = error instanceof TripoError && error.retryable;
        if (attempt >= attempts || !retryable) throw error;
        await wait(100 * attempt);
      }
    }
    throw lastError;
  }

  async #requestOnce(request, parseData) {
    if (!request.path.startsWith("/v2/")) {
      throw new TripoError("CONFIGURATION_ERROR", "Studio API paths must remain under /v2/.", { stage: "request" });
    }
    const identity = await this.#session.getRequestIdentity();
    const url = new URL(request.path, this.#config.apiBaseUrl);
    for (const [key, value] of Object.entries(request.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(new Error("request timeout")), request.timeoutMs ?? this.#config.requestTimeoutMs);
    let response;
    try {
      response = await this.#fetch(url, {
        method: request.method,
        headers: {
          accept: "application/json",
          ...(identity.authorization ? { authorization: identity.authorization } : {}),
          ...(identity.cookie ? { cookie: identity.cookie } : {}),
          "content-type": "application/json",
          origin: this.#config.studioOrigin,
          referer: `${this.#config.studioOrigin}/`,
          "user-agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36",
          "x-tripo-device-id": identity.deviceId,
          "x-tripo-region": identity.region,
          "x-tripo-start": performance.now().toString()
        },
        ...(request.body === undefined ? {} : { body: JSON.stringify(request.body) }),
        redirect: "error",
        signal: controller.signal
      });
    } catch (error) {
      clearTimeout(timeout);
      throw new TripoError("HTTP_ERROR", "Could not reach Tripo Studio.", {
        cause: error,
        retryable: request.retrySafe ?? false,
        safeToRetryPaidOperation: false,
        stage: "request"
      });
    }
    if (response.status === 401 || response.status === 403) {
      clearTimeout(timeout);
      void response.body?.cancel().catch(() => {});
      throw new TripoError("AUTH_EXPIRED", "Tripo Studio login expired; the session will be refreshed headlessly when possible.", {
        details: { http_status: response.status },
        retryable: false,
        stage: "request"
      });
    }
    try {
      let text;
      try {
        text = await readJsonResponse(response);
      } catch (error) {
        if (error instanceof TripoError) throw error;
        if (controller.signal.aborted) {
          throw new TripoError("HTTP_ERROR", "The Tripo Studio response timed out before it completed.", {
            retryable: request.retrySafe ?? false,
            safeToRetryPaidOperation: false,
            stage: "response_decode"
          });
        }
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio returned invalid UTF-8 JSON.", { cause: error, stage: "response_decode" });
      }
      if (!response.ok) {
        try {
          const envelope = apiEnvelopeSchema.safeParse(JSON.parse(text));
          if (envelope.success && envelope.data.code !== 0) throw remoteApiError(envelope.data);
        } catch (error) {
          if (error instanceof TripoError) throw error;
        }
        throw new TripoError("HTTP_ERROR", `Tripo Studio returned HTTP ${response.status}.`, {
          details: { http_status: response.status },
          retryable: (request.retrySafe ?? false) && (response.status === 429 || response.status >= 500),
          stage: "request"
        });
      }
      let parsedJson;
      try {
        parsedJson = JSON.parse(text);
      } catch (error) {
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio returned a non-JSON response.", { cause: error, stage: "response_decode" });
      }
      const envelope = apiEnvelopeSchema.safeParse(parsedJson);
      if (!envelope.success) {
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio response envelope changed.", { stage: "response_decode" });
      }
      if (envelope.data.code !== 0) throw remoteApiError(envelope.data);
      try {
        return parseData(envelope.data.data);
      } catch (error) {
        if (error instanceof TripoError) throw error;
        throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo Studio response data changed.", { cause: error, stage: "response_decode" });
      }
    } finally {
      clearTimeout(timeout);
    }
  }
}
