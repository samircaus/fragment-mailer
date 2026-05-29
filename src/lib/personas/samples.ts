// Persona utilities and types. Runtime storage via $lib/personas/service.js (D1).

export type { Persona, Brand } from './types.js';
export { SAMPLE_PERSONAS, SAMPLE_BRANDS } from './bundled.js';
export {
	personaSubtitle,
	validatePersonaData,
	resolvePreviewPersona,
	flattenPersona
} from './validate.js';

import { getBundledPersona, SAMPLE_PERSONAS } from './bundled.js';
import type { Persona } from './types.js';

/** Sync bundled fallback for tests and legacy callers. */
export function getPersona(id: string): Persona {
	return getBundledPersona(id) ?? SAMPLE_PERSONAS[0];
}
