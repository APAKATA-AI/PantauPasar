import { HttpError } from "../middleware/http-error.js";
import { providerRuntime, retryAfterSeconds } from "./provider-runtime.js";

const DEFAULT_MODEL = "deepseek-v4.1-flash-1017";
const FALLBACK_MODEL = "glm-5.3-flash";
const invalid = (message = "Jawaban Vleee belum sesuai format. Coba lagi nanti.") => new HttpError(502, "VLEEE_INVALID_RESPONSE", message);

export function getVleeeConfiguration() {
  const baseUrl = (process.env.VLEEE_BASE_URL || "https://my.vleee.net/v1").replace(/\/+$/, "");
  let url;
  try { url = new URL(baseUrl); } catch { throw new HttpError(503, "VLEEE_INVALID_CONFIG", "Alamat API Vleee belum valid."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash)
    throw new HttpError(503, "VLEEE_INVALID_CONFIG", "Alamat API Vleee harus HTTPS tanpa kredensial atau parameter URL.");
  return {
    baseUrl,
    models: [...new Set([process.env.VLEEE_MODEL || DEFAULT_MODEL, process.env.VLEEE_FALLBACK_MODEL || FALLBACK_MODEL])],
  };
}

function providerError(response) {
  const status = response.status;
  if (status === 401 || status === 403)
    return new HttpError(503, "VLEEE_AUTH_FAILED", "API key Vleee tidak valid atau belum memiliki akses.");
  if (status === 402 || status === 429) {
    const error = new HttpError(503, "VLEEE_QUOTA_EXCEEDED", "Kuota atau limit Vleee tercapai. Periksa limit akun API.");
    error.retryAfter = retryAfterSeconds(response);
    return error;
  }
  if (status === 503) return new HttpError(503, "VLEEE_BUSY", "Layanan Vleee sedang sibuk. Coba lagi nanti.");
  return new HttpError(502, "VLEEE_REQUEST_FAILED", "Vleee belum berhasil menyusun jawaban. Coba lagi nanti.");
}

async function* linesFromStream(body) {
  if (!body || typeof body[Symbol.asyncIterator] !== "function") throw invalid("Vleee tidak mengirim stream yang valid.");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let buffer = "";
  let received = 0;
  for await (const chunk of body) {
    received += typeof chunk === "string" ? Buffer.byteLength(chunk) : chunk.byteLength;
    if (received > 1_048_576) throw invalid("Stream Vleee melebihi batas ukuran jawaban.");
    buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
    let newline;
    while ((newline = buffer.indexOf("\n")) !== -1) {
      yield buffer.slice(0, newline).replace(/\r$/, "");
      buffer = buffer.slice(newline + 1);
    }
  }
  buffer += decoder.decode();
  if (buffer) yield buffer.replace(/\r$/, "");
}

async function readCompletion(response) {
  const contentType = response.headers?.get?.("content-type");
  if (contentType && !contentType.toLowerCase().includes("text/event-stream")) throw invalid("Vleee tidak mengirim format streaming SSE.");
  let content = "";
  let finishReason = null;
  let eventData = [];
  let done = false;
  function processEvent() {
    if (!eventData.length) return;
    const data = eventData.join("\n");
    eventData = [];
    if (data === "[DONE]") { done = true; return; }
    let payload;
    try { payload = JSON.parse(data); } catch { throw invalid("Stream Vleee mengirim format yang tidak valid."); }
    if (!payload || typeof payload !== "object" || payload.error) throw new HttpError(502, "VLEEE_REQUEST_FAILED", "Vleee gagal memproses permintaan.");
    const choice = payload.choices?.[0];
    const delta = choice?.delta?.content;
    if (typeof delta === "string") content += delta;
    if (content.length > 131_072) throw invalid("Jawaban Vleee melebihi batas ukuran.");
    if (choice?.finish_reason) finishReason = choice.finish_reason;
  }
  for await (const line of linesFromStream(response.body)) {
    if (!line) { processEvent(); if (done) break; }
    else if (line.startsWith("data:")) eventData.push(line.slice(5).trimStart());
  }
  processEvent();
  if (finishReason === "length") throw new HttpError(502, "VLEEE_OUTPUT_TRUNCATED", "Jawaban Vleee terpotong. Coba minta jawaban yang lebih singkat.");
  if (finishReason !== "stop" || !done) throw new HttpError(502, "VLEEE_STREAM_INCOMPLETE", "Stream Vleee terputus sebelum jawaban selesai. Coba lagi nanti.");
  if (!content.trim()) throw new HttpError(502, "VLEEE_EMPTY_RESPONSE", "Vleee mengirim jawaban kosong. Coba lagi nanti.");
  let parsed;
  try { parsed = JSON.parse(content); } catch { throw invalid(); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw invalid();
  return parsed;
}

export async function requestVleeeJson({ messages, maxTokens = 4096, temperature = 0, fetchImpl = fetch, timeoutMs = 25_000, models: modelOverride, runtime = providerRuntime }) {
  const apiKey = process.env.VLEEE_API_KEY?.trim();
  if (!apiKey) throw new HttpError(503, "VLEEE_NOT_CONFIGURED", "Vleee belum dikonfigurasi. Isi VLEEE_API_KEY di environment backend.");
  const config = getVleeeConfiguration();
  const models = [...new Set(modelOverride || config.models)].slice(0, 2);
  let lastError;
  for (const model of models) {
    try {
      return await runtime.run("vleee", async () => {
        let response;
        const abort = new AbortController();
        const deadline = Math.max(1, Math.min(timeoutMs, 60_000));
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => { abort.abort(); reject(new HttpError(504, "VLEEE_TIMEOUT", "Vleee terlalu lama merespons. Coba lagi nanti.")); }, deadline);
        });
        try {
          return await Promise.race([timeout, (async () => {
            response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
              method: "POST", redirect: "error",
              headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
              signal: abort.signal,
              body: JSON.stringify({ model, messages, max_tokens: Number.isInteger(maxTokens) ? Math.max(64, Math.min(16_384, maxTokens)) : 4096, temperature, response_format: { type: "json_object" }, stream: true }),
            });
            if (!response.ok) {
              await response.body?.cancel?.().catch(() => {});
              throw providerError(response);
            }
            return await readCompletion(response);
          })()]);
        } catch (error) {
          if (error instanceof HttpError) throw error;
          throw new HttpError(502, "VLEEE_UNAVAILABLE", "Vleee tidak dapat dihubungi atau stream terputus. Coba lagi nanti.");
        } finally {
          clearTimeout(timer);
          abort.abort();
        }
      });
    } catch (error) {
      lastError = error;
      if (["VLEEE_AUTH_FAILED", "VLEEE_QUOTA_EXCEEDED", "VLEEE_RATE_LIMITED", "VLEEE_INVALID_CONFIG"].includes(error.code)) throw error;
    }
  }
  throw lastError || new HttpError(503, "VLEEE_INVALID_CONFIG", "Model Vleee belum dikonfigurasi.");
}
