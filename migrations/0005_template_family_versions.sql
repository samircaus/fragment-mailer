-- Logical template family (e.g. promo) with multiple semver rows (id may be family@version).
ALTER TABLE email_templates ADD COLUMN family_id TEXT;

UPDATE email_templates SET family_id = id WHERE family_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_email_templates_family_version
	ON email_templates (family_id, version);
