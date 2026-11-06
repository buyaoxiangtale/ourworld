ALTER TABLE users ADD COLUMN IF NOT EXISTS account_type text NOT NULL DEFAULT 'individual' CHECK(account_type IN ('individual','agency'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS price_range jsonb;
ALTER TABLE users ADD COLUMN IF NOT EXISTS experience_years integer;
ALTER TABLE users ADD COLUMN IF NOT EXISTS languages text[] NOT NULL DEFAULT '{}';
-- PostgreSQL has no ADD CONSTRAINT IF NOT EXISTS; guard with a catalog check so
-- re-runs stay idempotent. Shape checks mirror the editMe zod schema.
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_price_range_check') THEN
  ALTER TABLE users ADD CONSTRAINT users_price_range_check CHECK (price_range IS NULL OR (jsonb_typeof(price_range)='object' AND price_range ? 'min' AND price_range ? 'max' AND (price_range->>'min')::numeric >= 0 AND (price_range->>'max')::numeric >= (price_range->>'min')::numeric));
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_experience_years_check') THEN
  ALTER TABLE users ADD CONSTRAINT users_experience_years_check CHECK (experience_years IS NULL OR experience_years BETWEEN 0 AND 90);
 END IF;
END
$$;
-- The 001 column CHECK is unnamed, so PostgreSQL auto-names it verifications_kind_check
-- on stock installs; IF EXISTS keeps environments that renamed it from aborting here
-- (a stray renamed constraint would then fail loudly on the ADD below).
ALTER TABLE verifications DROP CONSTRAINT IF EXISTS verifications_kind_check;
ALTER TABLE verifications ADD CONSTRAINT verifications_kind_check CHECK(kind IN ('professional','experience','agency'));
UPDATE profile_drafts SET layout=jsonb_set(layout,'{theme}','"nocturne"') WHERE layout->>'theme'='cream';
UPDATE profile_publications SET layout=jsonb_set(layout,'{theme}','"nocturne"') WHERE layout->>'theme'='cream';
UPDATE profile_history SET layout=jsonb_set(layout,'{theme}','"nocturne"') WHERE layout->>'theme'='cream';
UPDATE layout_jobs SET base_layout=jsonb_set(base_layout,'{theme}','"nocturne"') WHERE base_layout->>'theme'='cream';
UPDATE layout_jobs SET layout=jsonb_set(layout,'{theme}','"nocturne"') WHERE layout->>'theme'='cream';
