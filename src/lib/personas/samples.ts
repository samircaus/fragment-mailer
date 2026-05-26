// Hardcoded sample personas for preview rendering.
// These stand in for real AJO profile data at send time.
// profile.* tokens in the MJML template are resolved from the active persona during preview,
// but are preserved as literal tokens during export so AJO resolves them at send time.

export interface Persona {
	id: string;
	label: string;
	// Nested object shape mirrors AJO profile token paths, e.g.:
	// {{profile.person.name.firstName}} -> persona.person.name.firstName
	person: {
		name: {
			firstName: string;
			lastName: string;
		};
		email: string;
	};
	loyalty?: {
		tier: string;
		points: number;
	};
}

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

export function getPersona(id: string): Persona {
	return SAMPLE_PERSONAS.find((p) => p.id === id) ?? SAMPLE_PERSONAS[0];
}

// Flatten a persona into a dot-path lookup map so the resolver can handle
// tokens like {{profile.person.name.firstName}} without special-casing.
export function flattenPersona(persona: Persona): Record<string, unknown> {
	return flattenObject(persona as unknown as Record<string, unknown>);
}

function flattenObject(obj: Record<string, unknown>, prefix = ''): Record<string, unknown> {
	const result: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(obj)) {
		const path = prefix ? `${prefix}.${key}` : key;
		if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
			Object.assign(result, flattenObject(value as Record<string, unknown>, path));
		} else {
			result[path] = value;
		}
	}
	return result;
}
