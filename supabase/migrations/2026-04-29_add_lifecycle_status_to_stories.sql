ALTER TABLE stories
  ADD COLUMN lifecycle_status text NOT NULL DEFAULT 'developing'
  CONSTRAINT stories_lifecycle_status_check
  CHECK (lifecycle_status IN ('breaking', 'developing', 'resolved'));
