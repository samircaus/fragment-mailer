/** Short label for AJO content template ids in UI toasts and tooltips. */
export function shortAjoTemplateId(templateId: string): string {
	const id = templateId.trim();
	if (id.length <= 20) return id;
	return `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function formatAjoTemplateLabel(templateId: string): string {
	return `Template ${shortAjoTemplateId(templateId)}`;
}
