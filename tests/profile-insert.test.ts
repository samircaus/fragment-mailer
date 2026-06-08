import { describe, expect, it } from 'vitest';
import {
	buildProfileTokenSnippet,
	PROFILE_INSERT_FIELDS
} from '../src/lib/templates/profile-insert.js';

describe('profile-insert', () => {
	it('builds mj-text snippet with profile token', () => {
		expect(buildProfileTokenSnippet('profile.person.name.firstName')).toContain(
			'{{profile.person.name.firstName}}'
		);
	});

	it('exposes standard persona fields with profile.* tokens', () => {
		const tokens = PROFILE_INSERT_FIELDS.map((f) => f.token);
		expect(tokens).toContain('profile.person.name.firstName');
		expect(tokens).toContain('profile.person.email');
		expect(tokens.every((t) => t.startsWith('profile.'))).toBe(true);
	});
});
