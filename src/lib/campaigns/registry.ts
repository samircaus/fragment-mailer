export interface Campaign {
	id: string;
	name: string;
	templateId: string;
	cfPath: string;
	status: string;
}

export interface CampaignSummary {
	id: string;
	name: string;
	cfPath: string;
	templateId: string;
	status: string;
	updatedAt: string;
}

const campaigns: Record<string, Campaign> = {
	'mock-campaign-1': {
		id: 'mock-campaign-1',
		name: 'Spring Promo 2025',
		templateId: 'promo',
		cfPath: '/content/dam/campaigns/spring-promo-2025',
		status: 'draft'
	},
	'mock-campaign-2': {
		id: 'mock-campaign-2',
		name: 'Welcome Series — Email 1',
		templateId: 'promo',
		cfPath: '/content/dam/campaigns/welcome-series-1',
		status: 'draft'
	}
};

export function loadCampaign(id: string): Campaign | null {
	return campaigns[id] ?? null;
}

export function listMockCampaigns(): CampaignSummary[] {
	return Object.values(campaigns).map((c) => ({
		id: c.id,
		name: c.name,
		cfPath: c.cfPath,
		templateId: c.templateId,
		status: c.status,
		updatedAt: '2025-03-15T10:30:00Z'
	}));
}
