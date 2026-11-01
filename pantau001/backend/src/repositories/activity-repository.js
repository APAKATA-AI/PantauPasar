export function createActivityRepository(pool) {
  return {
    async list(session, limit) {
      const { rows } = await pool.query(
        `SELECT province, city, product, created_at
         FROM activity_history
         WHERE session_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [session, limit],
      );
      return rows;
    },

    async add(session, { province, city, product }) {
      const { rows } = await pool.query(
        `INSERT INTO activity_history (session_id, province, city, product)
         VALUES ($1, $2, $3, $4)
         RETURNING province, city, product, created_at`,
        [session, province, city, product],
      );
      return rows[0];
    },
  };
}
