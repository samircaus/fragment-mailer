CREATE TABLE IF NOT EXISTS preview_brands (
	id          TEXT PRIMARY KEY,
	label       TEXT NOT NULL,
	data_json   TEXT NOT NULL,
	is_builtin  INTEGER NOT NULL DEFAULT 0,
	created_at  TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

DROP TABLE IF EXISTS preview_companies;
