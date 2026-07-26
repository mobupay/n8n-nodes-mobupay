import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

// Mobupay action node: create hosted payment links, read payment status, refund.
// Redirect model: the buyer pays on the Mobupay hosted page (card data never
// touches your systems); the source of truth for "paid" is the signed webhook
// (see the Mobupay Trigger node) or an authenticated GET of the payment.
export class Mobupay implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Mobupay',
		name: 'mobupay',
		icon: 'file:mobupay.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Interact with the Mobupay payments API (hosted payment links, payments, refunds)',
		defaults: {
			name: 'Mobupay',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'mobupayApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Payment',
						value: 'payment',
					},
					{
						name: 'Payment Link',
						value: 'paymentLink',
					},
				],
				default: 'paymentLink',
			},

			// ── Payment Link ──────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['paymentLink'],
					},
				},
				options: [
					{
						name: 'Create',
						value: 'create',
						action: 'Create a payment link',
						description: 'Create a hosted payment link to send to a customer',
					},
				],
				default: 'create',
			},
			{
				displayName: 'Reference',
				name: 'reference',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'ORDER-1042',
				displayOptions: {
					show: {
						resource: ['paymentLink'],
						operation: ['create'],
					},
				},
				description:
					'Your order reference. Also used as the idempotency key by default: retrying with the same reference returns the same payment instead of creating a duplicate. A reference identifies ONE payment attempt: after a failed payment, create a link with a new reference.',
			},
			{
				displayName: 'Amount (Minor Units)',
				name: 'amount',
				type: 'number',
				required: true,
				default: 0,
				typeOptions: {
					minValue: 1,
				},
				displayOptions: {
					show: {
						resource: ['paymentLink'],
						operation: ['create'],
					},
				},
				description:
					'Amount in minor units: cents for EUR (1000 = 10.00 EUR), whole units for XPF (XPF has no decimals)',
			},
			{
				displayName: 'Currency',
				name: 'currency',
				type: 'options',
				options: [
					{
						name: 'EUR',
						value: 'EUR',
					},
					{
						name: 'XPF',
						value: 'XPF',
					},
				],
				default: 'XPF',
				displayOptions: {
					show: {
						resource: ['paymentLink'],
						operation: ['create'],
					},
				},
				description: 'Currency of the payment',
			},
			{
				displayName: 'Redirect URL',
				name: 'redirectUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://yourshop.example/thank-you',
				displayOptions: {
					show: {
						resource: ['paymentLink'],
						operation: ['create'],
					},
				},
				description: 'Where the buyer is sent back after the payment attempt',
			},
			{
				displayName: 'Notification URL',
				name: 'notificationUrl',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://your-n8n.example/webhook/...',
				displayOptions: {
					show: {
						resource: ['paymentLink'],
						operation: ['create'],
					},
				},
				description:
					'Webhook URL that receives the signed payment events, e.g. the production URL of a Mobupay Trigger node',
			},
			{
				displayName: 'Additional Fields',
				name: 'additionalFields',
				type: 'collection',
				placeholder: 'Add Field',
				default: {},
				displayOptions: {
					show: {
						resource: ['paymentLink'],
						operation: ['create'],
					},
				},
				options: [
					{
						displayName: 'Customer Email',
						name: 'customerEmail',
						type: 'string',
						placeholder: 'name@email.com',
						default: '',
						description:
							'If provided, the hosted page does not ask for the email again and the receipt is sent automatically',
					},
					{
						displayName: 'External ID',
						name: 'externalId',
						type: 'string',
						default: '',
						description:
							'Free correlation field echoed back in webhook events (defaults to the reference)',
					},
					{
						displayName: 'Idempotency Key',
						name: 'idempotencyKey',
						type: 'string',
						default: '',
						description: 'Overrides the idempotency key (defaults to the reference)',
					},
				],
			},

			// ── Payment ───────────────────────────────────────────────────────
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['payment'],
					},
				},
				options: [
					{
						name: 'Get',
						value: 'get',
						action: 'Get a payment',
						description: 'Fetch the authoritative status and details of a payment',
					},
					{
						name: 'Refund',
						value: 'refund',
						action: 'Refund a payment',
						description: 'Refund a payment, in full or partially',
					},
				],
				default: 'get',
			},
			{
				displayName: 'Payment ID',
				name: 'paymentId',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'pay_xxxxxxxxxxxxxxxx',
				displayOptions: {
					show: {
						resource: ['payment'],
						operation: ['get', 'refund'],
					},
				},
				description: 'The Mobupay payment ID (returned when creating a payment link)',
			},
			{
				displayName: 'Amount (Minor Units)',
				name: 'refundAmount',
				type: 'number',
				default: 0,
				typeOptions: {
					minValue: 0,
				},
				displayOptions: {
					show: {
						resource: ['payment'],
						operation: ['refund'],
					},
				},
				description:
					'Amount to refund in minor units (EUR cents, or whole XPF units). Leave 0 to refund the remaining amount in full.',
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		const resource = this.getNodeParameter('resource', 0) as string;
		const operation = this.getNodeParameter('operation', 0) as string;

		const credentials = await this.getCredentials('mobupayApi');
		const baseUrl = String(credentials.baseUrl || 'https://api.mobupay.nc').replace(/\/$/, '');

		for (let i = 0; i < items.length; i++) {
			try {
				let responseData: IDataObject;

				if (resource === 'paymentLink' && operation === 'create') {
					const reference = String(this.getNodeParameter('reference', i));
					const amount = Math.round(Number(this.getNodeParameter('amount', i)));
					const currency = String(this.getNodeParameter('currency', i));
					const redirectUrl = String(this.getNodeParameter('redirectUrl', i));
					const notificationUrl = String(this.getNodeParameter('notificationUrl', i));
					const additionalFields = this.getNodeParameter('additionalFields', i) as IDataObject;

					if (!Number.isFinite(amount) || amount <= 0) {
						throw new NodeOperationError(
							this.getNode(),
							'Amount must be a positive number in minor units (EUR cents, or whole XPF units)',
							{ itemIndex: i },
						);
					}

					const body: IDataObject = {
						order: {
							reference,
							amount,
							currency,
						},
						redirectUrl,
						notificationUrl,
						externalId: String(additionalFields.externalId || reference),
					};
					if (additionalFields.customerEmail) {
						body.email = String(additionalFields.customerEmail);
					}

					const options: IHttpRequestOptions = {
						method: 'POST',
						url: `${baseUrl}/api/v1/payments/links`,
						headers: {
							// Idempotency: a network retry or a re-run with the same key
							// returns the SAME payment instead of creating a second one.
							'Idempotency-Key': String(additionalFields.idempotencyKey || reference),
						},
						body,
						json: true,
					};
					responseData = (await this.helpers.httpRequestWithAuthentication.call(
						this,
						'mobupayApi',
						options,
					)) as IDataObject;
				} else if (resource === 'payment' && operation === 'get') {
					const paymentId = String(this.getNodeParameter('paymentId', i));
					responseData = (await this.helpers.httpRequestWithAuthentication.call(this, 'mobupayApi', {
						method: 'GET',
						url: `${baseUrl}/api/v1/payments/${encodeURIComponent(paymentId)}`,
						json: true,
					})) as IDataObject;
				} else if (resource === 'payment' && operation === 'refund') {
					const paymentId = String(this.getNodeParameter('paymentId', i));
					const refundAmount = Math.round(Number(this.getNodeParameter('refundAmount', i)));
					const body: IDataObject = {};
					if (refundAmount > 0) {
						body.amount = refundAmount;
					}
					responseData = (await this.helpers.httpRequestWithAuthentication.call(this, 'mobupayApi', {
						method: 'POST',
						url: `${baseUrl}/api/v1/payments/${encodeURIComponent(paymentId)}/refund`,
						body,
						json: true,
					})) as IDataObject;
				} else {
					throw new NodeOperationError(
						this.getNode(),
						`Unsupported operation "${operation}" for resource "${resource}"`,
						{ itemIndex: i },
					);
				}

				returnData.push({
					json: responseData,
					pairedItem: { item: i },
				});
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: i },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
