/** Family id from a stored template id (handles `family@version`). */
export function templateFamilyIdFromTemplateId(templateId: string): string {
	const at = templateId.indexOf('@');
	return at >= 0 ? templateId.slice(0, at) : templateId;
}

/** Pure AJO (standalone) templates use the `ajo-` family prefix. */
export function isStandaloneTemplateFamilyId(familyId: string): boolean {
	return familyId.startsWith('ajo-');
}

export function isStandaloneTemplateId(templateId: string): boolean {
	return isStandaloneTemplateFamilyId(templateFamilyIdFromTemplateId(templateId));
}
