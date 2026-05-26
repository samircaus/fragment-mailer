// AEM Content Fragment Model definition for EmailCampaign.
// Mirrors what would be POSTed to the AEM CF Model API or stored in /conf.
// Used for documentation, validation, and tooling — not loaded at runtime.

export interface CFModelField {
	name: string;
	type: 'text' | 'richtext' | 'reference';
	label: string;
	required: boolean;
	referenceType?: 'fragment';
	allowedModels?: string[];
}

export interface CFModel {
	id: string;
	title: string;
	description: string;
	fields: CFModelField[];
}

export const CF_MODEL: CFModel = {
	id: 'EmailCampaign',
	title: 'Email Campaign',
	description: 'Promotional email campaign content',
	fields: [
		{ name: 'heroHeadline', type: 'text',      label: 'Hero Headline',    required: true  },
		{ name: 'subtitle',     type: 'text',      label: 'Subtitle',         required: false },
		{ name: 'bodyCopy',     type: 'richtext',  label: 'Body Copy',        required: true  },
		{ name: 'ctaText',      type: 'text',      label: 'CTA Button Text',  required: true  },
		{ name: 'ctaUrl',       type: 'text',      label: 'CTA URL',          required: true  },
		{
			name: 'featuredOffer',
			type: 'reference',
			label: 'Featured Offer CF',
			required: false,
			referenceType: 'fragment',
			allowedModels: ['Offer']
		}
	]
};
