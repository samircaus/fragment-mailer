CREATE TABLE IF NOT EXISTS campaign_template_prefs (
	campaign_id          TEXT NOT NULL,
	ims_org_id           TEXT NOT NULL,
	ajo_sandbox          TEXT NOT NULL,
	selected_template_id TEXT NOT NULL,
	updated_at           TEXT NOT NULL DEFAULT (datetime('now')),
	PRIMARY KEY (campaign_id, ims_org_id, ajo_sandbox)
);
