export interface Persona {
	id: string;
	label: string;
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

export interface Brand {
	id: string;
	label: string;
	name: string;
	logoUrl?: string;
	privacyUrl?: string;
}

export type PersonaData = Omit<Persona, 'id'>;
export type BrandData = Omit<Brand, 'id'>;
