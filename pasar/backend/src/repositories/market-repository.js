export function createMarketRepository(pool) {
  return {
    async upsertObservations(observations) {
      const batchSize = 250;
      let stored = 0;
      for (let offset = 0; offset < observations.length; offset += batchSize) {
        const batch = observations.slice(offset, offset + batchSize);
        const values = [];
        const rows = batch.map((item, index) => {
          const start = index * 10;
          values.push(
            item.commodity,
            item.province,
            item.city,
            item.price,
            item.unit,
            item.currency,
            item.source_name,
            item.source_url,
            item.observed_at,
            item.confidence_score,
          );
          return `(${Array.from(
            { length: 10 },
            (_, parameter) => `$${start + parameter + 1}`,
          ).join(", ")})`;
        });
        const result = await pool.query(
          `INSERT INTO market_prices
             (commodity, province, city, price, unit, currency, source_name,
              source_url, observed_at, confidence_score)
           VALUES ${rows.join(", ")}
           ON CONFLICT (commodity, province, city, source_name, observed_at)
           DO UPDATE SET
             price = EXCLUDED.price,
             unit = EXCLUDED.unit,
             currency = EXCLUDED.currency,
             source_url = EXCLUDED.source_url,
             confidence_score = EXCLUDED.confidence_score`,
          values,
        );
        stored += result.rowCount;
      }
      return stored;
    },

    async findObservations({ product, province, city }) {
      const { rows } = await pool.query(
        `SELECT commodity, province, city, unit, price, source_name, source_url,
                observed_at, confidence_score
         FROM market_prices
         WHERE commodity = $1 AND province = $2 AND city = $3
           AND observed_at >= NOW() - INTERVAL '30 days'
         ORDER BY observed_at ASC
         LIMIT 5000`,
        [product, province, city],
      );
      return rows;
    },

    async findRegionalAverages({ product, province, unit }) {
      const { rows } = await pool.query(
        `WITH latest AS (
           SELECT city, MAX(observed_at::date) AS day
           FROM market_prices
           WHERE commodity = $1 AND province = $2 AND unit = $3
             AND observed_at >= NOW() - INTERVAL '30 days'
           GROUP BY city
         )
         SELECT prices.city, AVG(prices.price)::numeric AS average_price,
                MAX(prices.observed_at) AS observed_at
         FROM market_prices prices
         JOIN latest ON prices.city = latest.city AND prices.observed_at::date = latest.day
         WHERE prices.commodity = $1 AND prices.province = $2 AND prices.unit = $3
         GROUP BY prices.city
         ORDER BY average_price ASC`,
        [product, province, unit],
      );
      return rows;
    },
  };
}
