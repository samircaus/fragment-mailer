import { describe, it, expect, beforeEach } from 'vitest';
import {
	listPersonas,
	updatePersona,
	getPersonaById,
	resetPersonaStoreForTests
} from '../src/lib/personas/service.js';
import {
	listBrands,
	updateBrand,
	resolveBrand,
	resetBrandStoreForTests
} from '../src/lib/brands/service.js';

describe('preview personas (in-memory fallback)', () => {
	beforeEach(() => {
		resetPersonaStoreForTests();
	});

	it('seeds bundled personas on first list', async () => {
		const personas = await listPersonas(undefined);
		expect(personas.length).toBeGreaterThanOrEqual(3);
	});

	it('persists persona edits', async () => {
		await listPersonas(undefined);
		const result = await updatePersona(undefined, 'persona-1', {
			label: 'Updated Sarah',
			person: {
				name: { firstName: 'Sarah', lastName: 'Updated' },
				email: 'sarah.updated@example.com'
			}
		});
		expect(result.ok).toBe(true);
		const loaded = await getPersonaById(undefined, 'persona-1');
		expect(loaded.label).toBe('Updated Sarah');
	});
});

describe('preview brands (in-memory fallback)', () => {
	beforeEach(() => {
		resetBrandStoreForTests();
	});

	it('seeds bundled brands on first list', async () => {
		const brands = await listBrands(undefined);
		expect(brands.map((b) => b.id)).toContain('acme-corp');
	});

	it('persists brand edits', async () => {
		await listBrands(undefined);
		const result = await updateBrand(undefined, 'acme-corp', {
			label: 'Acme International',
			name: 'Acme International',
			logoUrl: 'https://example.com/logo.png'
		});
		expect(result.ok).toBe(true);
		const resolved = await resolveBrand(undefined, { brandId: 'acme-corp' });
		expect(resolved.name).toBe('Acme International');
		expect(resolved.logoUrl).toBe('https://example.com/logo.png');
	});
});
