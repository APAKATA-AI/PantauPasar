"use strict";

(() => {
  class ApiError extends Error {
    constructor(message, status, retry = 30, code = null) {
      super(message);
      this.status = status;
      this.retry = retry;
      this.code = code;
    }
  }

  async function request(path, options = {}, fallback) {
    const controller = new AbortController();
    const externalSignal = options.signal;
    const abort = () => controller.abort();
    externalSignal?.addEventListener("abort", abort, { once: true });
    if (externalSignal?.aborted) controller.abort();
    let timedOut = false;
    const timer = setTimeout(
      () => { timedOut = true; controller.abort(); },
      window.PP_CONFIG.requestTimeoutMs,
    );
    try {
      const response = await fetch(`${window.PP_CONFIG.apiBaseUrl}${path}`, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          "X-Session-Id": window.PP_CONFIG.sessionId,
          ...options.headers,
        },
        signal: controller.signal,
      });
      if ([404, 501, 503].includes(response.status) && fallback)
        return { data: fallback(), fallback: true };
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(
          payload?.error?.message ||
            "Layanan belum berhasil membaca data. Coba lagi beberapa saat.",
          response.status,
          Math.max(1, Math.min(300, Number(response.headers.get("Retry-After")) || 30)),
          payload?.error?.code || null,
        );
      }
      return { data: await response.json(), fallback: false };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (externalSignal?.aborted) throw new ApiError("Pencarian dibatalkan.", 0, 0, "CANCELLED");
      if (timedOut) throw new ApiError("Pencarian melewati batas waktu. Coba lagi beberapa saat.", 0, 0, "TIMEOUT");
      if (fallback) return { data: fallback(), fallback: true };
      throw new ApiError(
        "Tidak dapat menghubungi layanan. Periksa koneksi lalu coba lagi.",
        0,
      );
    } finally {
      clearTimeout(timer);
      externalSignal?.removeEventListener("abort", abort);
    }
  }

  window.PantauApi = Object.freeze({ ApiError, request });
})();
