CREATE TABLE IF NOT EXISTS market_prices (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  commodity TEXT NOT NULL CHECK (length(trim(commodity)) BETWEEN 1 AND 120),
  province TEXT NOT NULL CHECK (length(trim(province)) BETWEEN 1 AND 100),
  city TEXT NOT NULL CHECK (length(trim(city)) BETWEEN 1 AND 100),
  price NUMERIC(14, 2) NOT NULL CHECK (price > 0),
  unit TEXT NOT NULL CHECK (length(trim(unit)) BETWEEN 1 AND 30),
  currency CHAR(3) NOT NULL DEFAULT 'IDR' CHECK (currency = 'IDR'),
  source_name TEXT NOT NULL CHECK (length(trim(source_name)) BETWEEN 1 AND 200),
  source_url TEXT CHECK (source_url IS NULL OR source_url ~ '^https?://'),
  observed_at TIMESTAMPTZ NOT NULL,
  confidence_score SMALLINT CHECK (confidence_score IS NULL OR confidence_score BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS market_prices_lookup_idx
  ON market_prices (commodity, province, city, observed_at DESC);

CREATE INDEX IF NOT EXISTS market_prices_region_idx
  ON market_prices (commodity, province, unit, observed_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS market_prices_source_observation_idx
  ON market_prices (commodity, province, city, source_name, observed_at);

CREATE TABLE IF NOT EXISTS activity_history (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id UUID NOT NULL,
  province TEXT NOT NULL CHECK (length(trim(province)) BETWEEN 1 AND 100),
  city TEXT NOT NULL CHECK (length(trim(city)) BETWEEN 1 AND 100),
  product TEXT NOT NULL CHECK (length(trim(product)) BETWEEN 1 AND 120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS activity_history_session_idx
  ON activity_history (session_id, created_at DESC);
