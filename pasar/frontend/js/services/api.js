"use strict";

(() => {
  class ApiError extends Error {
    constructor(message, status, retry = 30) {
      super(message);
      this.status = status;
      this.retry = retry;
    }
  }

  async function request(path, options = {}, fallback) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
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
      if (response.status === 429)
        throw new ApiError(
          "Terlalu banyak permintaan.",
          429,
          Number(response.headers.get("Retry-After")) || 30,
        );
      if ([404, 501, 503].includes(response.status) && fallback)
        return { data: fallback(), fallback: true };
      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new ApiError(
          payload?.error?.message ||
            "Layanan belum berhasil membaca data. Coba lagi beberapa saat.",
          response.status,
        );
      }
      return { data: await response.json(), fallback: false };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      if (fallback) return { data: fallback(), fallback: true };
      throw new ApiError(
        "Tidak dapat menghubungi layanan. Periksa koneksi lalu coba lagi.",
        0,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  window.PantauApi = Object.freeze({ ApiError, request });
})();
