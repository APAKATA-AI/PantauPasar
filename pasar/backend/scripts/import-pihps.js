import { pool } from "../src/config/database.js";
import { createPihpsClient } from "../src/integrations/pihps-client.js";
import { createMarketRepository } from "../src/repositories/market-repository.js";
import { createPihpsImportService } from "../src/services/pihps-import-service.js";

function parseDays(args) {
  const option = args.find((item) => item.startsWith("--days="));
  if (!option) return 30;
  const days = Number(option.slice("--days=".length));
  if (!Number.isInteger(days) || days < 1 || days > 90)
    throw new Error("Gunakan --days dengan angka bulat antara 1 dan 90.");
  return days;
}

try {
  const days = parseDays(process.argv.slice(2));
  if (!pool)
    throw new Error("DATABASE_URL belum dikonfigurasi. Impor PIHPS dibatalkan.");
  const service = createPihpsImportService({
    client: createPihpsClient(),
    repository: createMarketRepository(pool),
  });
  console.log(JSON.stringify(await service.importRecent({ days }), null, 2));
} catch (error) {
  console.error("Impor PIHPS gagal:", error.message);
  process.exitCode = 1;
} finally {
  if (pool) await pool.end();
}
