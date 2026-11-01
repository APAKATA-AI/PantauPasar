import { askGemini } from "../integrations/gemini-advisor.js";
import { HttpError } from "../middleware/http-error.js";
import { requiredText } from "../middleware/validate.js";

export const advisorController = {
  async ask(req, res) {
    const body = req.body || {};
    const question = requiredText(body.pertanyaan, "Pertanyaan", 1500);
    const context = {
      query: body.konteks ?? null,
      market: body.market ?? null,
      calculation: body.perhitungan ?? null,
    };
    if (JSON.stringify(context).length > 8000)
      throw new HttpError(400, "INVALID_INPUT", "Konteks konsultasi terlalu besar.");
    res.json(await askGemini({ question, context }));
  },
};
