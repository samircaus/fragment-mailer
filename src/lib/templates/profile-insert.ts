export interface ProfileInsertField {
	label: string;
	type: 'text' | 'number';
	token: string;
	snippet: string;
}

export function buildProfileTokenSnippet(token: string): string {
	return `<mj-text>\n  {{${token}}}\n</mj-text>`;
}

/** Standard AJO profile / persona tokens for the MJML insert-field menu. */
export const PROFILE_INSERT_FIELDS: ProfileInsertField[] = [
	{
		label: 'First name',
		type: 'text',
		token: 'profile.person.name.firstName',
		snippet: buildProfileTokenSnippet('profile.person.name.firstName')
	},
	{
		label: 'Last name',
		type: 'text',
		token: 'profile.person.name.lastName',
		snippet: buildProfileTokenSnippet('profile.person.name.lastName')
	},
	{
		label: 'Email',
		type: 'text',
		token: 'profile.person.email',
		snippet: buildProfileTokenSnippet('profile.person.email')
	},
	{
		label: 'Loyalty tier',
		type: 'text',
		token: 'profile.loyalty.tier',
		snippet: buildProfileTokenSnippet('profile.loyalty.tier')
	},
	{
		label: 'Loyalty points',
		type: 'number',
		token: 'profile.loyalty.points',
		snippet: buildProfileTokenSnippet('profile.loyalty.points')
	},
	{
		label: 'Current year',
		type: 'text',
		token: 'profile.system.year',
		snippet: buildProfileTokenSnippet('profile.system.year')
	},
	{
		label: 'Unsubscribe URL',
		type: 'text',
		token: 'profile.system.unsubscribe',
		snippet: buildProfileTokenSnippet('profile.system.unsubscribe')
	}
];
