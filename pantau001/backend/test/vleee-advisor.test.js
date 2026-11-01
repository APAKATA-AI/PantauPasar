import assert from "node:assert/strict";
import test from "node:test";
import { askVleee } from "../src/integrations/vleee-advisor.js";

test("Vleee advisor returns the validated advisor response", async () => {
  const previousKey = process.env.VLEEE_API_KEY;
  process.env.VLEEE_API_KEY = "test-key";
  try {
    const answer = {
      ringkasan: "Uji produk yang paling diminati.",
      yang_perlu_dilakukan: "Mulai dari jumlah kecil.",
      hati_hati: "Catat perubahan biaya.",
    };
    const result = await askVleee(
      {
        question: "Bagaimana meningkatkan penjualan?",
        context: {},
      },
      async () => ({
        ok: true,
        body: {
          async *[Symbol.asyncIterator]() {
            const encoder = new TextEncoder();
            yield encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: { content: JSON.stringify(answer) } }] })}\n\n`,
            );
            yield encoder.encode(
              `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`,
            );
          },
        },
      }),
    );
    assert.deepEqual(result, answer);
  } finally {
    if (previousKey === undefined) delete process.env.VLEEE_API_KEY;
    else process.env.VLEEE_API_KEY = previousKey;
  }
});
