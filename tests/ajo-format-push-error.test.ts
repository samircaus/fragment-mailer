import { describe, expect, it } from 'vitest';
import { formatAjoPushError } from '../src/lib/ajo/format-push-error.js';

describe('formatAjoPushError', () => {
	it('includes message, request, status, and response body', () => {
		const text = formatAjoPushError({
			message: 'AJO POST failed 404',
			failure: {
				method: 'POST',
				url: 'https://platform.adobe.io/ajo/content/templates',
				path: '/ajo/content/templates',
				baseUrl: 'https://platform.adobe.io',
				status: 404,
				statusText: 'Not Found',
				responseBody: '<html>404</html>'
			}
		});
		expect(text).toContain('AJO POST failed 404');
		expect(text).toContain('POST https://platform.adobe.io/ajo/content/templates');
		expect(text).toContain('Status: 404 Not Found');
		expect(text).toContain('<html>404</html>');
	});
});
