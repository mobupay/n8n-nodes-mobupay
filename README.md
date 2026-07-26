# n8n-nodes-mobupay

This is an n8n community node for [Mobupay](https://mobupay.nc), the payment
solution for New Caledonia and the Pacific (Mobupay is an agent of eZyness, a
licensed French EMI).

It lets you create hosted payment links, check payment status, refund payments,
and react to signed Mobupay webhook events from your n8n workflows. Redirect
model: the buyer pays on the Mobupay hosted page, card data never touches your
systems.

[n8n](https://n8n.io/) is a fair-code licensed workflow automation platform.

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/)
in the n8n community nodes documentation. Package name: `n8n-nodes-mobupay`.

## Credentials

Create a **Mobupay API** credential:

| Field | Value |
|---|---|
| API Key | Your secret key from the Mobupay merchant dashboard: `sk_test_…` (sandbox) or `sk_live_…` (production) |
| Webhook Secret | Your account signing secret `whsec_…` (dashboard, or `GET /api/v1/webhooks/signing-secret`). Required by the Mobupay Trigger node |
| Base URL | Leave the default (`https://api.mobupay.nc`) unless instructed otherwise by Mobupay support |

## Nodes

### Mobupay (actions)

- **Payment Link > Create**: creates a hosted payment link. Amounts are in
  minor units (EUR cents, whole XPF units). The `reference` doubles as the
  idempotency key: retrying with the same reference returns the same payment
  instead of creating a duplicate. A reference identifies ONE payment attempt:
  after a failed payment, create a new link with a new reference.
- **Payment > Get**: fetches the authoritative status and details of a payment.
- **Payment > Refund**: refunds a payment, partially (amount in minor units) or
  in full (leave the amount at 0). Note: refunds are only possible once the
  payment has settled (the day after capture); during the settlement window the
  API declines the refund.

### Mobupay Trigger

Starts the workflow when Mobupay sends a webhook event. The node:

1. verifies the **V2 signature** (HMAC-SHA256 of `<timestamp>.<raw body>` with
   your `whsec_…` secret) on the exact raw body,
2. rejects stale timestamps (5 minutes anti-replay window),
3. emits the parsed event if its type is in your subscription list (other
   verified events are acknowledged with HTTP 200 and ignored).

Use the **production webhook URL** of the trigger as the `notificationUrl` of
your payments (the Create Payment Link operation has a field for it), or
register it in your Mobupay dashboard.

**Marking an order as paid**: listen to both `payment.authorized` (real card
flow) and `payment.captured` (sandbox) — the default selection — and reconcile
with your order using `data.externalId` or `data.reference`.

## Typical flow

1. **Mobupay > Payment Link > Create** with your order reference and amount →
   send `linkUrl` to the customer (email, SMS, chat…).
2. **Mobupay Trigger** (same credentials) receives `payment.authorized` /
   `payment.captured` → mark the order paid.
3. Optionally **Mobupay > Payment > Get** to re-check the status at any time.

## Compatibility

Tested with n8n 1.x (Node.js >= 20.15). No runtime dependencies.

## Resources

- [Mobupay integration guides](https://docs.mobupay.nc/guides/no-code)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/community-nodes/)

## License

[MIT](LICENSE)
