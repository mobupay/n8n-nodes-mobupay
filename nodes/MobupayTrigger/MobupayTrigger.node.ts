import { createHmac, timingSafeEqual } from 'crypto';
import type {
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

// Maximum accepted clock skew for the webhook timestamp (anti-replay), seconds.
const MAX_SKEW_SECONDS = 300;

const EVENT_OPTIONS = [
	'payment.authorized',
	'payment.captured',
	'payment.failed',
	'payment.cancelled',
	'payment.expired',
	'payment.refunded',
	'payment.partially_refunded',
];

// Mobupay webhook trigger. Verifies the V2 signature (HMAC-SHA256 hex of
// "<timestamp>.<raw body>" with the account whsec_ secret) on the RAW request
// body, rejects stale timestamps, then emits the parsed event.
//
// Note: on a real card flow the "paid" event is payment.authorized; the sandbox
// emits payment.captured. Listen to both (the default) to mark an order as paid.
export class MobupayTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mobupay Trigger',
		name: 'mobupayTrigger',
		icon: 'file:mobupay.svg',
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["events"].join(", ")}}',
		description: 'Starts the workflow when Mobupay sends a signed webhook event',
		defaults: {
			name: 'Mobupay Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'mobupayApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName:
					'Use the production webhook URL of this node as the notificationUrl of your payments (or register it in your Mobupay dashboard). Events are verified with the Webhook Secret of the selected credentials.',
				name: 'setupNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				options: EVENT_OPTIONS.map((event) => ({ name: event, value: event })),
				default: ['payment.authorized', 'payment.captured'],
				required: true,
				description:
					'The events to listen to. Other (verified) events are acknowledged with HTTP 200 but do not start the workflow.',
			},
		],
	};

	webhookMethods = {
		default: {
			// The webhook URL is registered manually (dashboard or notificationUrl):
			// there is nothing to create or delete on the Mobupay side.
			async checkExists(): Promise<boolean> {
				return true;
			},
			async create(): Promise<boolean> {
				return true;
			},
			async delete(): Promise<boolean> {
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const req = this.getRequestObject();
		const res = this.getResponseObject();
		const headers = this.getHeaderData() as Record<string, string | undefined>;

		const credentials = await this.getCredentials('mobupayApi');
		const secret = String(credentials.webhookSecret || '');
		if (!secret) {
			res.status(500).json({ message: 'Mobupay Trigger: the credentials have no Webhook Secret (whsec_…)' });
			return { noWebhookResponse: true };
		}

		// The signature covers the EXACT raw body: never re-serialize the JSON.
		const rawBodyBuffer = (req as unknown as { rawBody?: Buffer }).rawBody;
		const rawBody =
			rawBodyBuffer !== undefined ? rawBodyBuffer.toString('utf8') : JSON.stringify(this.getBodyData());

		const timestamp = headers['x-mobupay-timestamp'];
		const signature = headers['x-mobupay-signature-v2'];
		if (!timestamp || !signature) {
			res.status(401).json({ message: 'Missing Mobupay signature headers' });
			return { noWebhookResponse: true };
		}

		const nowSeconds = Math.floor(Date.now() / 1000);
		if (Math.abs(nowSeconds - Number(timestamp)) > MAX_SKEW_SECONDS) {
			res.status(401).json({ message: 'Mobupay webhook timestamp outside the accepted window' });
			return { noWebhookResponse: true };
		}

		const expected = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`, 'utf8').digest('hex');
		const expectedBuffer = Buffer.from(expected);
		const signatureBuffer = Buffer.from(String(signature));
		const valid =
			expectedBuffer.length === signatureBuffer.length && timingSafeEqual(expectedBuffer, signatureBuffer);
		if (!valid) {
			res.status(401).json({ message: 'Invalid Mobupay V2 signature' });
			return { noWebhookResponse: true };
		}

		let event: { type?: string; data?: unknown };
		try {
			event = JSON.parse(rawBody) as { type?: string; data?: unknown };
		} catch {
			res.status(400).json({ message: 'Invalid JSON body' });
			return { noWebhookResponse: true };
		}

		const events = this.getNodeParameter('events') as string[];
		if (!event.type || !events.includes(event.type)) {
			// Verified but not subscribed: acknowledge so Mobupay does not retry.
			res.status(200).json({ received: true, ignored: true });
			return { noWebhookResponse: true };
		}

		return {
			workflowData: [this.helpers.returnJsonArray([{ verified: true, ...(event as object) }])],
		};
	}
}
