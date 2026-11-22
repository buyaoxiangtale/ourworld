ALTER TABLE users ADD COLUMN IF NOT EXISTS school text;
ALTER TABLE users ADD COLUMN IF NOT EXISTS education_level text;
DO $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_school_length_check') THEN
  ALTER TABLE users ADD CONSTRAINT users_school_length_check CHECK (school IS NULL OR char_length(school) <= 120);
 END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='users_education_level_check') THEN
  ALTER TABLE users ADD CONSTRAINT users_education_level_check CHECK (education_level IS NULL OR education_level IN ('high-school','vocational','associate','bachelor','master','doctorate','other'));
 END IF;
END
$$;
