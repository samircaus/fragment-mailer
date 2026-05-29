import type { Brand, Persona } from './types.js';

export const SAMPLE_PERSONAS: Persona[] = [
	{
		id: 'persona-1',
		label: 'Standard member (Sarah)',
		person: {
			name: { firstName: 'Sarah', lastName: 'Mitchell' },
			email: 'sarah.mitchell@example.com'
		},
		loyalty: { tier: 'Gold', points: 4250 }
	},
	{
		id: 'persona-2',
		label: 'New customer (Marcus)',
		person: {
			name: { firstName: 'Marcus', lastName: 'Chen' },
			email: 'marcus.chen@example.com'
		}
	},
	{
		id: 'persona-3',
		label: 'VIP member (Elena)',
		person: {
			name: { firstName: 'Elena', lastName: 'Vasquez' },
			email: 'elena.vasquez@example.com'
		},
		loyalty: { tier: 'Platinum', points: 18900 }
	}
];

export const SAMPLE_BRANDS: Brand[] = [
	{ id: 'acme-corp', label: 'Acme Corp', name: 'Acme Corp' },
	{ id: 'globex-corporation', label: 'Globex Corporation', name: 'Globex Corporation' },
	{ id: 'wayne-enterprises', label: 'Wayne Enterprises', name: 'Wayne Enterprises' },
	{ id: 'stark-industries', label: 'Stark Industries', name: 'Stark Industries' }
];

export function getBundledPersona(id: string): Persona | undefined {
	return SAMPLE_PERSONAS.find((p) => p.id === id);
}

export function getBundledBrand(id: string): Brand | undefined {
	return SAMPLE_BRANDS.find((b) => b.id === id);
}

export function getBundledBrandByName(name: string): Brand | undefined {
	return SAMPLE_BRANDS.find((b) => b.name === name);
}
