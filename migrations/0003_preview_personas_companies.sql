CREATE TABLE IF NOT EXISTS preview_personas (
	id          TEXT PRIMARY KEY,
	label       TEXT NOT NULL,
	data_json   TEXT NOT NULL,
	is_builtin  INTEGER NOT NULL DEFAULT 0,
	created_at  TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS preview_companies (
	id            TEXT PRIMARY KEY,
	name          TEXT NOT NULL,
	logo_url      TEXT,
	privacy_url   TEXT,
	is_builtin    INTEGER NOT NULL DEFAULT 0,
	created_at    TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_preview_companies_name ON preview_companies (name);
