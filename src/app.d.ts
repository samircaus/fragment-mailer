// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
	namespace App {
		interface Locals {
			aem?: {
				token: string;
				authorHost: string;
			};
		}
		interface Platform {
			env: Env;
			cf: CfProperties;
			ctx: ExecutionContext;
		}
	}
}

// Wrangler-generated bindings (run `npm run cf-typegen` to regenerate)
interface Env {
	ASSETS: Fetcher;
	// AEM connection
	AEM_TIER: string;
	AEM_BASE_URL: string;
	AEM_API_KEY: string;
	AEM_CAMPAIGNS_PATH: string;
	AEM_FETCH_MODE: string;
	OAUTH_CONFIG_PATH: string;
	AEM_GRAPHQL_ENDPOINT: string;
	AEM_GRAPHQL_LIST_QUERY: string;
	AEM_GRAPHQL_BY_PATH_QUERY: string;
	AEM_GRAPHQL_BY_PATH_PARAM: string;
	// Adobe IMS credentials (OAuth server-to-server)
	IMS_CLIENT_ID: string;
	IMS_CLIENT_SECRET: string;
	IMS_ORG_ID: string;
	IMS_HOST: string;
	IMS_SCOPES: string;
	// AJO connection
	AJO_SANDBOX: string;
	// Feature flags
	MOCK_MODE: string; // "true" | "false"
}

export {};
