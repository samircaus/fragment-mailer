CREATE TABLE IF NOT EXISTS email_templates (
	id                         TEXT PRIMARY KEY,
	name                       TEXT NOT NULL,
	version                    TEXT NOT NULL DEFAULT '1.0.0',
	cf_model                   TEXT NOT NULL DEFAULT '',
	definition_json            TEXT NOT NULL,
	mjml                       TEXT NOT NULL,
	component_definition_json  TEXT,
	component_models_json      TEXT,
	is_builtin                 INTEGER NOT NULL DEFAULT 0,
	created_at                 TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at                 TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_email_templates_cf_model ON email_templates (cf_model);
