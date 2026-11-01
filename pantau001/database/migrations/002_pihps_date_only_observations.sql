BEGIN;

UPDATE market_prices
SET observed_at =
  (observed_at AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC'
WHERE source_name = 'Bank Indonesia (PIHPS)'
  AND observed_at <>
    ((observed_at AT TIME ZONE 'UTC')::date::timestamp AT TIME ZONE 'UTC');

COMMIT;
