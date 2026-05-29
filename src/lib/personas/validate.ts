import { getBundledPersona, SAMPLE_PERSONAS } from './bundled.js';
import type { Persona } from './types.js';

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
	if (!personaJson) return getBundledPersona(personaId) ?? SAMPLE_PERSONAS[0];
	try {
		const parsed = JSON.parse(personaJson) as unknown;
		const result = validatePersonaData(parsed, personaId);
		return result.ok ? result.persona : (getBundledPersona(personaId) ?? SAMPLE_PERSONAS[0]);
	} catch {
		return getBundledPersona(personaId) ?? SAMPLE_PERSONAS[0];
	}
}

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
