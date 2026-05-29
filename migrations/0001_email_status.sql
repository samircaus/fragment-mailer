CREATE TABLE IF NOT EXISTS email_status (
	cf_uuid           TEXT NOT NULL,
	campaign_id       TEXT NOT NULL,
	ims_org_id        TEXT NOT NULL,
	ajo_sandbox       TEXT NOT NULL,

	remote_template_id TEXT,
	last_pushed_at     TEXT,
	aem_modified_at    TEXT,
	content_hash       TEXT,
	last_push_error    TEXT,
	updated_at         TEXT NOT NULL DEFAULT (datetime('now')),

	PRIMARY KEY (cf_uuid, ims_org_id, ajo_sandbox)
);

CREATE INDEX IF NOT EXISTS idx_email_status_campaign
	ON email_status (campaign_id, ims_org_id, ajo_sandbox);
