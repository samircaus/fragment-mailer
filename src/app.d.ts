// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
	namespace App {
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
	AEM_BASE_URL: string;
	AEM_API_KEY: string;
	// Adobe IMS credentials (OAuth server-to-server)
	IMS_CLIENT_ID: string;
	IMS_CLIENT_SECRET: string;
	IMS_ORG_ID: string;
	// AJO connection
	AJO_SANDBOX: string;
	// Feature flags
	MOCK_MODE: string; // "true" | "false"
}

export {};
