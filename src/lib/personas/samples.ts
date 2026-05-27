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

export const PERSONAS_STORAGE_KEY = 'editor-personas';

export function getPersona(id: string): Persona {
	return SAMPLE_PERSONAS.find((p) => p.id === id) ?? SAMPLE_PERSONAS[0];
}

export function mergeStoredPersonas(stored: Persona[]): Persona[] {
	return SAMPLE_PERSONAS.map((sample) => {
		const override = stored.find((p) => p.id === sample.id);
		if (!override) return JSON.parse(JSON.stringify(sample)) as Persona;
		return { ...JSON.parse(JSON.stringify(sample)), ...override, id: sample.id } as Persona;
	});
}

export function personaSubtitle(persona: Persona): string {
	const name = persona.person.name.firstName;
	const tier = persona.loyalty?.tier;
	return tier ? `${name} · ${tier}` : name;
}

export function validatePersonaData(
	data: unknown,
	expectedId: string
): { ok: true; persona: Persona } | { ok: false; error: string } {
	if (!data || typeof data !== 'object' || Array.isArray(data)) {
		return { ok: false, error: 'Persona must be a JSON object' };
	}

	const obj = data as Record<string, unknown>;
	const person = obj.person;
	if (!person || typeof person !== 'object' || Array.isArray(person)) {
		return { ok: false, error: 'Missing "person" object' };
	}

	const personObj = person as Record<string, unknown>;
	const name = personObj.name;
	if (!name || typeof name !== 'object' || Array.isArray(name)) {
		return { ok: false, error: 'Missing "person.name" object' };
	}

	const nameObj = name as Record<string, unknown>;
	if (typeof nameObj.firstName !== 'string' || !nameObj.firstName.trim()) {
		return { ok: false, error: '"person.name.firstName" is required' };
	}

	const persona: Persona = {
		id: expectedId,
		label: typeof obj.label === 'string' && obj.label.trim() ? obj.label.trim() : 'Persona',
		person: {
			name: {
				firstName: nameObj.firstName.trim(),
				lastName: typeof nameObj.lastName === 'string' ? nameObj.lastName : ''
			},
			email: typeof personObj.email === 'string' ? personObj.email : ''
		}
	};

	const loyalty = obj.loyalty;
	if (loyalty && typeof loyalty === 'object' && !Array.isArray(loyalty)) {
		const loyaltyObj = loyalty as Record<string, unknown>;
		persona.loyalty = {
			tier: typeof loyaltyObj.tier === 'string' ? loyaltyObj.tier : '',
			points: typeof loyaltyObj.points === 'number' ? loyaltyObj.points : 0
		};
	}

	return { ok: true, persona };
}

export function resolvePreviewPersona(personaId: string, personaJson: string | null): Persona {
	if (!personaJson) return getPersona(personaId);
	try {
		const parsed = JSON.parse(personaJson) as unknown;
		const result = validatePersonaData(parsed, personaId);
		return result.ok ? result.persona : getPersona(personaId);
	} catch {
		return getPersona(personaId);
	}
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
