CREATE TABLE IF NOT EXISTS ajo_fragment_drafts (
	id          TEXT PRIMARY KEY,
	name        TEXT NOT NULL,
	description TEXT NOT NULL DEFAULT '',
	expression  TEXT NOT NULL DEFAULT '',
	sub_type    TEXT NOT NULL DEFAULT 'HTML',
	created_at  TEXT NOT NULL DEFAULT (datetime('now')),
	updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
