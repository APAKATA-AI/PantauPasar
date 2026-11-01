BEGIN;

ALTER TABLE market_prices
  ALTER COLUMN confidence_score DROP NOT NULL;

ALTER TABLE market_prices
  DROP CONSTRAINT IF EXISTS market_prices_confidence_score_check;

ALTER TABLE market_prices
  ADD CONSTRAINT market_prices_confidence_score_check
  CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100);

CREATE UNIQUE INDEX IF NOT EXISTS market_prices_source_observation_idx
  ON market_prices (commodity, province, city, source_name, observed_at);

COMMIT;
