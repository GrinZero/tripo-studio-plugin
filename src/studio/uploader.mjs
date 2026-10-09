import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { NodeHttpHandler } from "@smithy/node-http-handler";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Agent as HttpsAgent } from "node:https";
import path from "node:path";
import { TripoError } from "../errors.mjs";
import { sanitizeMessage } from "../redact.mjs";
import { S3_MULTIPART_SIZE } from "../constants.mjs";

const DEFAULT_REQUEST_TIMEOUT_MS = 120000;
const DEFAULT_UPLOAD_TIMEOUT_MS = 20 * 60000;
const DEFAULT_CONNECTION_TIMEOUT_MS = 15000;
const DEFAULT_SOCKET_TIMEOUT_MS = 60000;
const DEFAULT_MAX_ATTEMPTS = 3;

const CONTENT_TYPES = Object.freeze({
  ".fbx": "application/octet-stream",
  ".glb": "model/gltf-binary",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".obj": "model/obj",
  ".png": "image/png",
  ".stl": "model/stl",
  ".webp": "image/webp"
});

function contentTypeForUpload(filePath) {
  return CONTENT_TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function safeAwsIdentifier(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(value)) return undefined;
  if (sanitizeMessage(value) !== value) return undefined;
  return value;
}

function objectRecord(value) {
  return value !== null && typeof value === "object" ? value : undefined;
}

function safeUploadErrorDetails(error) {
  const record = objectRecord(error);
  const metadata = objectRecord(record?.["$metadata"]);
  const details = {};
  const name = safeAwsIdentifier(error instanceof Error ? error.name : record?.["name"]);
  const code = safeAwsIdentifier(record?.["Code"] ?? record?.["code"]);
  const httpStatus = typeof metadata?.["httpStatusCode"] === "number" && Number.isSafeInteger(metadata["httpStatusCode"]) ? metadata["httpStatusCode"] : undefined;
  if (name !== undefined) details.name = name;
  if (code !== undefined) details.code = code;
  if (httpStatus !== undefined) details.http_status = httpStatus;
  const cause = objectRecord(record?.["cause"]);
  const transport = safeAwsIdentifier(cause?.["code"]);
  if (transport !== undefined) details.transport_code = transport;
  return details;
}

function validateTarget(token) {
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(token.resource_bucket)) {
    throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo returned an invalid upload bucket.", { stage: "upload" });
  }
  if (token.resource_uri.startsWith("/") || token.resource_uri.includes("\0")) {
    throw new TripoError("REMOTE_SCHEMA_CHANGED", "Tripo returned an invalid upload object key.", { stage: "upload" });
  }
}

// Multipart upload to Tripo's S3-compatible temporary storage using the
// short-lived STS token minted by /v2/studio/storage/temporary_token.
export class AwsObjectUploader {
  #requestTimeoutMs;
  #uploadTimeoutMs;
  constructor(options = {}) {
    this.#requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS;
    this.#uploadTimeoutMs = options.uploadTimeoutMs ?? DEFAULT_UPLOAD_TIMEOUT_MS;
  }

  async upload(filePath, token) {
    validateTarget(token);
    const metadata = await stat(filePath);
    const abortController = new AbortController();
    const deadline = setTimeout(() => abortController.abort(), this.#uploadTimeoutMs);
    deadline.unref();
    let lastError;
    try {
      for (const useAccelerate of [true, false]) {
        if (abortController.signal.aborted) break;
        let client;
        let body;
        try {
          const requestHandler = new NodeHttpHandler({
            connectionTimeout: Math.min(DEFAULT_CONNECTION_TIMEOUT_MS, this.#requestTimeoutMs),
            httpsAgent: new HttpsAgent({ keepAlive: false }),
            requestTimeout: this.#requestTimeoutMs,
            socketTimeout: Math.min(DEFAULT_SOCKET_TIMEOUT_MS, this.#requestTimeoutMs),
            throwOnRequestTimeout: true
          });
          client = new S3Client({
            credentials: {
              accessKeyId: token.sts_ak,
              secretAccessKey: token.sts_sk,
              sessionToken: token.session_token
            },
            maxAttempts: DEFAULT_MAX_ATTEMPTS,
            region: "us-west-2",
            requestChecksumCalculation: "WHEN_REQUIRED",
            requestHandler,
            responseChecksumValidation: "WHEN_REQUIRED",
            useAccelerateEndpoint: useAccelerate
          });
          body = createReadStream(filePath);
          const upload = new Upload({
            abortController,
            client,
            leavePartsOnError: false,
            params: {
              Body: body,
              Bucket: token.resource_bucket,
              ContentLength: metadata.size,
              ContentType: contentTypeForUpload(filePath),
              Key: token.resource_uri
            },
            partSize: S3_MULTIPART_SIZE,
            queueSize: 2
          });
          await upload.done();
          return { bucket: token.resource_bucket, key: token.resource_uri };
        } catch (error) {
          lastError = error;
          const status = safeUploadErrorDetails(error).http_status;
          const fallbackAllowed = typeof status !== "number" || status === 408 || status === 425 || status === 429 || status >= 500;
          if (!useAccelerate || abortController.signal.aborted || !fallbackAllowed) break;
        } finally {
          body?.destroy();
          try {
            client?.destroy();
          } catch {}
        }
      }
      throw new TripoError("HTTP_ERROR", "The file upload to Tripo storage failed.", {
        details: safeUploadErrorDetails(lastError),
        retryable: true,
        safeToRetryPaidOperation: true,
        stage: "upload"
      });
    } finally {
      clearTimeout(deadline);
    }
  }
}
