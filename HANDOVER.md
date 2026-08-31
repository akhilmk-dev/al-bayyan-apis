# Al Bayyan Backend — Handover

## What this is

Node.js/Express + MongoDB backend for Al Bayyan, a Shopify-backed grocery/marketplace app with an admin dashboard, a delivery-agent mobile app, and a customer-facing live-tracking API. Cloned and rebranded from a reference project ("curry-cut"), then extended with several Al-Bayyan-specific features (see below).

- **Repo**: `https://github.com/akhilmk-dev/al-bayyan-apis`
- **Live URL**: `https://al-bayyan-apis.onrender.com`
- **API docs**: `/api-docs` (Swagger UI, kept up to date — every endpoint below is documented there with request/response shapes)

## Tech stack

Express 5, Mongoose 8 (MongoDB Atlas), JWT auth (`jsonwebtoken` + `bcryptjs`), Zod validation, `swagger-ui-express` + `yamljs` for docs, `axios` for all external HTTP calls (no other HTTP client). CommonJS throughout.

## Local setup

1. `npm install`
2. Copy `.env.example` → `.env` and fill in real values (see **Credentials still needed** below — several are placeholders).
3. `npm run dev` (nodemon) or `npm run start`.
4. First-time DB setup: `node scripts/seedPermissions.js` seeds the full permission catalogue and grants everything to an `Admin` role. There's no "create first admin user" script — insert one manually (or via `POST /api/V1/users` once you have any authenticated admin) with that Admin role.

**Windows-specific note**: this dev machine's default DNS resolver can't do the SRV lookup `mongodb+srv://` needs. `config/db.js` already has a fallback (retries with 8.8.8.8/1.1.1.1 if the first attempt fails with `querySrv ECONNREFUSED`) — this is a permanent fix in the code, not something you need to work around manually.

## Credentials still needed (all in `.env.example`, currently blank)

| Var | Purpose | Status |
|---|---|---|
| `SHOPIFY_BASE_URL`, `SHOPIFY_TOKEN`, `SHOPIFY_ADMIN_API` | Shopify store integration | ✅ configured (real store) |
| `GOOGLE_MAPS_API_KEY` | Geocodes customer addresses for live tracking | ❌ not yet supplied |
| `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` | Push notifications to delivery agents (staff app, bundle `com.AlbayanDelivery`) | ✅ configured |
| `ONESIGNAL_CUSTOMER_APP_ID`, `ONESIGNAL_CUSTOMER_REST_API_KEY` | Push notifications to customers (customer app, bundle `com.albayan`) | ✅ configured — credentials accepted live (verified against a test external ID, "not subscribed" response as expected with no device registered yet) |
| `TRACKING_API_KEY` | Shared secret the customer/mobile app uses — now gates live tracking **and** the return-request/reorder endpoints (see Feature 5), not just tracking | ✅ generated — **must also be placed in the customer app's own `.env`**, it's not fetched from anywhere |
| `BREVO_API_KEY`, `BREVO_SENDER_EMAIL` | Sends delivery-confirmation OTP emails to customers | ❌ not yet supplied — OTP currently hardcoded to `5555` regardless (see below) |

## Core domain model

- **User** (admin/vendor dashboard accounts) → **Role** → **Permission** (RBAC, enforced server-side via `middleware/permissionMiddleware.js`, not just hidden client-side)
- **DeliveryAgent** — separate auth entity from User, own JWT, no Role/Permission relationship (agent routes are `authenticate`-only, never `requirePermission`)
- **Order** — mirrors Shopify orders locally; this is where almost all of the custom logic lives (see Features)
- **AgentEarning** — immutable per-delivery ledger (one row per completed delivery, snapshots the pay rate at the time)
- **Settings** — singleton doc, currently just holds `delivery_earning_rate`

## Features built in this engagement (beyond the original port)

### 1. Delivery-agent earnings
Admin sets a flat per-delivery rate (`/settings` page, `Settings` permission group). Every time an order is delivered, `AgentEarning.create(...)` snapshots the *current* rate — changing the rate later never alters past earnings. Agent app: `GET /agent/delivery-agent/earnings` (today/month/total). Admin can see per-agent totals on the Agent Details page.

### 2. Live order tracking
- `Order.shipping_address.latitude/longitude` get geocoded via Google Maps on order creation (and self-heal on update if the first attempt failed) — `utils/geocodeClient.js`, fails silently if unconfigured.
- Agent app pings `PUT /agent/delivery-agent/update-location/:id` every 10-15s while `Picked Up`; stored as `Order.current_location` (single current value, not a history log — cleared automatically once the order reaches Delivered/Cancelled, from **three** call sites: `updateDeliveryStatus`, `fulfilOrder`, `cancelOrder`).
- Customer app calls `GET /orders/track/:orderId` with a static shared `x-api-key` header (`TRACKING_API_KEY`) — no JWT, no per-order token. Returns destination + agent's current position + status.

### 3. Order assignment accept/reject
When admin assigns an order, it enters `assignment_status: 'pending_acceptance'`. The agent must explicitly:
- **Accept** (`PUT /agent/delivery-agent/orders/:id/accept`) → jumps straight to `Picked Up` (no separate manual "mark picked up" step anymore).
- **Reject** (`PUT /agent/delivery-agent/orders/:id/reject`, reason **required**) → assignment is cleared, the order needs reassignment, and that agent is permanently recorded in `Order.rejected_agents` so they can never be reassigned to that specific order again (enforced both in the admin UI dropdown and server-side in `assignAgentToOrder`).
- Admin sees a distinct red "Assignment Failed" badge (Orders list + detail page) when this happens, and the rejection reason in the order timeline.
- **Known gap**: admin isn't proactively notified of a rejection (no push/email) — they only see it by looking at the order.

### 4. OTP-gated delivery confirmation
Marking an order `Delivered` now requires two steps — `updateDeliveryStatus` rejects a direct `status: 'Delivered'` request with a 400 pointing at this flow instead:
1. `POST /agent/delivery-agent/orders/:id/request-delivery-otp` — generates an OTP, emails the customer via Brevo, order stays `Picked Up`. **Currently hardcoded to `5555`** (matches the existing forgot-password OTP convention, which is also a hardcoded `555555`) — swap for a real random generator once this is going to production with real customers, not just testing.
2. `PUT /agent/delivery-agent/orders/:id/verify-delivery-otp` — only on a correct, unexpired OTP (1 minute validity) does the order actually get marked Delivered (Shopify fulfillment sync + earnings credit + live-location cleanup all happen here now, in a shared `completeDelivery()` helper in `deliveryAgentController.js`).
- If `BREVO_API_KEY` isn't set, the email send is skipped and logged — the OTP flow still works end-to-end for testing (the response always echoes `Default: 5555` regardless, same transparency convention as the existing agent-password-reset OTP).

### 5. Refunds, returns, real cancel-sync, and reorder (mobile app)
- **Cancel now actually syncs to Shopify.** `POST /orders/cancel` used to only update the local Mongo record — Shopify's own order never got cancelled. It now calls Shopify's `orderCancel` GraphQL mutation first (`graphql/mutations/order.mutation.js`); a `400` with Shopify's error list is returned if Shopify rejects it (already cancelled, active return in progress, etc.), and the local record is only updated after Shopify accepts. Cancellation is async on Shopify's side — the existing `orders/updated` webhook reconciles final status once Shopify's job finishes.
- **Refunds** (`Order.refunds`, append-only) are populated from the `refunds/create` webhook (`POST /orders/refund`, public/unauthenticated like every other Shopify webhook receiver in this repo).
- **Returns** (`Order.returns`) — the mobile app can request a return via `POST /orders/customer/:customerId/:orderId/return` (protected by `TRACKING_API_KEY`, same as live tracking), which calls Shopify's `returnRequest` mutation (status `REQUESTED`, needs merchant approval in Shopify admin — not auto-opened). Status is kept in sync afterwards via four webhook receivers: `/orders/return-requested` (catch-all for returns created directly in Shopify, not just via the app), `/orders/return-approved` (→ status `OPEN`, Shopify has no separate "approved" status), `/orders/return-declined`, `/orders/return-closed`.
- **Reorder** — `POST /orders/customer/:customerId/:orderId/reorder` (same `TRACKING_API_KEY` auth) calls Shopify's `draftOrderCreateFromOrder` mutation, which duplicates the past order into a new Draft Order, and returns its `invoiceUrl` for the customer to complete payment in a webview. No payment details are stored/replayed here — the resulting real order comes back through the existing `orders/create` webhook once they check out. There is no dedicated Shopify "reorder" webhook topic; a reorder is just an ordinary new order.
- All enum values and mutation/field names above (`OrderCancelReason`, `ReturnReason`, `ReturnStatus`, `ReturnRequestInput`, `draftOrderCreateFromOrder`, etc.) were confirmed by introspecting the live store's schema at API version `2025-10` — not guessed from docs.
- **Shopify webhook subscriptions that must be registered** (Admin → Settings → Notifications → Webhooks, or via the Admin API) — this is a dashboard step, nothing in this repo sends these:

  | Topic | Endpoint | Status |
  |---|---|---|
  | `orders/create` | `/api/V1/orders/` | Should already exist (pre-dates this feature) — confirm it's actually subscribed. |
  | `orders/updated` | `/api/V1/orders/` | Same receiver as above — confirm this topic is also subscribed, not just `orders/create`. |
  | `refunds/create` | `/api/V1/orders/refund` | **New — needs registering.** |
  | `returns/request` | `/api/V1/orders/return-requested` | **New — needs registering.** |
  | `returns/approve` | `/api/V1/orders/return-approved` | **New — needs registering.** |
  | `returns/decline` | `/api/V1/orders/return-declined` | **New — needs registering.** |
  | `returns/close` | `/api/V1/orders/return-closed` | **New — needs registering.** |

  Not built: `returns/cancel` and `returns/reopen` (same pattern, only worth adding if actually needed — don't register these topics without also building their receivers, or Shopify will 404 and eventually auto-disable the webhook).
- **Known gap**: none of the webhook receivers verify Shopify's `X-Shopify-Hmac-Sha256` signature yet — same pre-existing TODO as `/products/product-delete`, just relying on the URL being obscure for now.
- **Bug fixed (worth knowing about)**: the return-request flow was silently failing end-to-end for a while — two separate issues, both now fixed and verified against the live store:
  1. `submitReturnRequest` used the wrong GraphQL input field name (`returnReasonNote` instead of Shopify's actual `customerNote` on `ReturnRequestLineItemInput`) and the wrong ID entirely for `fulfillmentLineItemId` (was reusing `Order.line_items[].fulfillment_item_id`, which is a **FulfillmentOrder** line item ID captured at order-sync time for `fulfillmentCreateV2` — a completely different Shopify resource from the **FulfillmentLineItem** ID the Returns API needs, which only exists once a real `Fulfillment` record exists post-shipment). Fixed by resolving the real FulfillmentLineItem ID live via a new query (`graphql/queries/order.query.js` → `ORDER_FULFILLMENT_LINE_ITEMS_QUERY`), keyed by the order's plain `LineItem` ID instead (`Order.line_items[].id`) — so the request-body contract changed from `fulfillment_line_item_id` to `line_item_id` on both the mobile and admin return-request endpoints.
  2. `submitReturnRequest` never checked GraphQL's top-level `errors` array (only the mutation's own `userErrors`) — so when Shopify rejected the request outright (as it always did given bug #1), the code fell through and silently saved a fake local return record (`return_id: null`) while reporting `200 success` to the caller. Fixed: top-level `errors` are now checked and surfaced as a real `400`, and a missing `return.id` in a "successful" response is now also treated as a failure rather than recorded.
- **Admin return management** (new): the Order Details page's Return Requests card is no longer read-only.
  - **Approve** / **Decline** (`POST /orders/return/approve` / `/orders/return/decline`) — call Shopify's `returnApproveRequest`/`returnDeclineRequest` directly and update `Order.returns[].status` immediately, without waiting on the `returns/approve`/`returns/decline` webhooks above (which may not even be registered).
  - **Process Refund** (`POST /orders/return/refund`, only once a return is `OPEN`/approved) — queries Shopify's `suggestedRefund` for the return's exact items to get the correct amount/gateway/transaction, forwards that into `refundCreate` (Shopify's own recommended pattern, avoids hand-computing refund amounts), records the resulting refund under `Order.refunds` (same shape the `refunds/create` webhook uses), and closes the return (`returnClose`).
  - The admin dashboard's "Request Return" button is now hidden once an order already has an active (`REQUESTED`/`OPEN`) return, to prevent duplicate requests on the same items. This is a client-side check only (in `al-bayyan-backend`) — the API itself doesn't block a duplicate request, so the mobile app should add the same guard once it builds its own return-request UI.

### 6. Push notifications (OneSignal)
- **New Delivery Assignment Alerts** — pre-existing, `assignAgentToOrder` pushes to the agent the moment an order is assigned.
- **Customer status-update notifications** — new. The customer's mobile app now gets pushed on `Picked Up`/`Delivered`/`Cancelled`, from every real place `delivery_status` changes (`acceptOrder`, `completeDelivery`, `updateDeliveryStatus`, `pickupOrder`, `cancelOrder` — see `utils/notifyCustomerStatus.js`). `cancelOrder` also now actually sets `delivery_status: 'Cancelled'`, which it previously never did (only `cancelled_at`/`cancel_reason`).
- **Agent assignment-reminder cron** — new. `jobs/deliveryReminderJob.js` runs every 5 minutes and pings the agent if an assignment has sat `pending_acceptance` longer than `Settings.assignment_reminder_minutes` (admin-configurable via `PUT /admin/settings`, default 15). Fires once per assignment cycle (`Order.reminder_sent_at`, reset on every reassignment).
- **Customer app action item (not something this repo can do)**: `sendCustomerNotification` targets OneSignal's `include_external_user_ids` by `order.customer.id` (the Shopify customer ID) - this only works once the **customer mobile app** calls `OneSignal.login(String(customerId))` after identifying the customer, exactly like the staff app already does for agents (see `utils/sendNotification.js`'s docstring). Until then it silently no-ops, same as every other unconfigured integration in this repo.
- **Credentials**: `ONESIGNAL_CUSTOMER_APP_ID`/`ONESIGNAL_CUSTOMER_REST_API_KEY` (customer app, bundle `com.albayan`) are now configured and verified live. `ONESIGNAL_APP_ID`/`ONESIGNAL_REST_API_KEY` (agent/staff app, bundle `com.AlbayanDelivery`) are now configured too - the customer pair no longer needs to fall back to them.
- **Deep link**: customer notifications now include an `app_url` of `com.albayan://OrderHistory/<shopify order_id>` (`utils/notifyCustomerStatus.js`) - screen/route name `OrderHistory` is confirmed against the actual customer app's navigation. Uses the Shopify `order_id`, not the Mongo `_id` - that's what the customer app's own detail/invoice/return/reorder endpoints all key on (`GET /orders/customer/:customerId/:orderId` and siblings), unlike the staff app's `OrderDetail` deep link which correctly uses the Mongo `_id` since `GET /agent/delivery-agent/order-detail/:id` looks up by `_id`.
- **System Notifications** (admin broadcast / automated admin alerts) — explicitly descoped for now, not built.

## Known bugs fixed during this engagement (worth knowing about, not re-introducing)

- Logout used to look up the wrong Mongo field (`refreshToken` vs the schema's actual `refresh_token`) — silently never revoked tokens. Fixed.
- `middleware/errorHandler.js`'s fallback branch checked `err.statusCode`, but custom error classes set `err.status` — most intentional 400/403/etc. responses were silently becoming 500. Fixed.
- `orderController.js`'s `cancelOrder` never sent an HTTP response at all — any caller would hang until timeout. Fixed.
- The `/orders/track/:orderId` swagger server URL and the general swagger `servers:` list pointed at a placeholder/wrong domain — fixed to the real Render URL.

## Test accounts currently in the live database

- Admin: `admin@albayyan.test` / `AlBayyan#Test123`
- Delivery agent (test): `agent@albayyan.test` / `AlBayyan#Agent123`
- There's also a real agent account (`sree@mail.com`) not created by this work — password unknown, reset via admin panel if needed.

**These are throwaway test credentials sitting in a real database (and in chat history) — rotate/remove before this is customer-facing.**

## Deployment

Render, auto-deploys from `main` on this repo. Environment variables must be set in Render's dashboard separately — they do **not** read from the local `.env` file.

## Not built / explicitly out of scope

- The actual delivery-agent mobile app and customer-tracking app UIs — this repo is API-only for both; they're separate codebases not in this workspace.
- Reject-after-pickup (a "delivery failed" action once an agent already has the order in hand) — explicitly requested then explicitly descoped, not built.
- Admin notification-on-rejection (see gap above).
- Real random OTP generation (currently hardcoded `5555` by explicit request, for initial testing).
