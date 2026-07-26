import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

// Mobupay API credentials. The API key authenticates outgoing calls (Bearer);
// the account webhook secret (whsec_...) is used by the Mobupay Trigger node to
// verify incoming webhook signatures (HMAC-SHA256 V2 scheme).
export class MobupayApi implements ICredentialType {
	name = 'mobupayApi';

	displayName = 'Mobupay API';

	documentationUrl = 'https://docs.mobupay.nc/guides/no-code';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Secret API key from your Mobupay merchant dashboard. Use sk_test_… for the sandbox and sk_live_… for production.',
		},
		{
			displayName: 'Webhook Secret',
			name: 'webhookSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Account signing secret (whsec_…) used to verify incoming webhooks. Required by the Mobupay Trigger node. Retrieve it with GET /api/v1/webhooks/signing-secret or from your dashboard.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.mobupay.nc',
			description: 'Advanced. Leave the default value unless instructed otherwise by Mobupay support.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/api/v1/webhooks/signing-secret',
		},
	};
}
