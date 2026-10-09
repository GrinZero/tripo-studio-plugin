import { sanitizeMessage } from "./redact.mjs";

export class TripoError extends Error {
  constructor(code, message, options = {}) {
    super(sanitizeMessage(message), { cause: options.cause });
    this.name = "TripoError";
    this.code = code;
    this.retryable = options.retryable ?? false;
    this.safeToRetryPaidOperation = options.safeToRetryPaidOperation ?? false;
    this.submissionState = options.submissionState ?? "not_submitted";
    this.nextAction = options.nextAction;
    this.stage = options.stage;
    this.details = options.details;
  }
}

export function toTripoError(error, stage) {
  if (error instanceof TripoError) return error;
  const message = error instanceof Error ? error.message : String(error);
  return new TripoError("HTTP_ERROR", message, {
    cause: error,
    retryable: false,
    safeToRetryPaidOperation: false,
    ...(stage === undefined ? {} : { stage })
  });
}

// A remote rejection is definitive only when Studio clearly refused the
// request before producing a receipt: auth rejection, business error codes,
// or a non-retryable 4xx. Ambiguous transport failures never qualify.
export function isDefinitiveRemoteRejection(error) {
  if (!(error instanceof TripoError)) return false;
  if (["AUTH_EXPIRED", "INSUFFICIENT_CREDITS", "REMOTE_API_ERROR", "CONTENT_AUDIT_REJECTED"].includes(error.code)) {
    return true;
  }
  if (error.code !== "HTTP_ERROR" || typeof error.details?.http_status !== "number") return false;
  const status = error.details.http_status;
  return Number.isInteger(status) && status >= 400 && status < 500 && status !== 408 && status !== 425;
}

export function errorSnapshot(error) {
  const normalized = error instanceof TripoError ? error : toTripoError(error);
  return {
    code: normalized.code,
    message: sanitizeMessage(normalized.message).slice(0, 500),
    retryable: normalized.retryable,
    safe_to_retry_paid_operation: normalized.safeToRetryPaidOperation,
    submission_state: normalized.submissionState,
    stage: normalized.stage ?? null,
    ...(normalized.nextAction === undefined ? {} : { next_action: normalized.nextAction })
  };
}
