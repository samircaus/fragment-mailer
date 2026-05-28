// In-memory AJO template ID per campaign (lost on Worker cold start).
// Clients should persist returned templateId (e.g. localStorage) and pass it on update.

const store = new Map<string, string>();

export function getAjoTemplateId(campaignId: string): string | undefined {
	return store.get(campaignId);
}

export function setAjoTemplateId(campaignId: string, templateId: string): void {
	store.set(campaignId, templateId);
}

export function clearAjoTemplateStore(): void {
	store.clear();
}
