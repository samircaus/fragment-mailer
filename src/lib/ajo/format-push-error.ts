import type { AjoRequestFailure } from './client.js';

export interface AjoPushErrorPayload {
	message?: string;
	failure?: AjoRequestFailure;
	validationErrors?: Array<{ message: string }>;
}

/** Full error text for AJO push failure dialogs and copy. */
export function formatAjoPushError(payload: AjoPushErrorPayload): string {
	const lines: string[] = [];

	if (payload.message?.trim()) {
		lines.push(payload.message.trim());
	}

	const f = payload.failure;
	if (f) {
		if (f.method && f.url) {
			lines.push('', `Request: ${f.method} ${f.url}`);
		}
		if (f.status != null) {
			const statusLine = f.statusText
				? `Status: ${f.status} ${f.statusText}`
				: `Status: ${f.status}`;
			lines.push(statusLine);
		}
		if (f.sandboxName) lines.push(`Sandbox: ${f.sandboxName}`);
		if (f.imsOrg) lines.push(`IMS org: ${f.imsOrg}`);
		if (f.request?.payloadName) lines.push(`Template name: ${f.request.payloadName}`);
		if (f.request?.templateId) lines.push(`Remote template id: ${f.request.templateId}`);
		if (f.responseHeaders && Object.keys(f.responseHeaders).length > 0) {
			lines.push('', 'Response headers:');
			for (const [key, value] of Object.entries(f.responseHeaders)) {
				lines.push(`  ${key}: ${value}`);
			}
		}
		if (f.responseBody != null && f.responseBody !== '') {
			lines.push('', 'Response body:', f.responseBody);
		}
		if (f.stack?.trim()) {
			lines.push('', 'Stack:', f.stack.trim());
		}
	}

	if (payload.validationErrors?.length) {
		lines.push('', 'Validation:');
		for (const err of payload.validationErrors) {
			lines.push(`  • ${err.message}`);
		}
	}

	if (lines.length === 0) return 'AJO push failed (no details returned).';
	return lines.join('\n');
}
