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
| `ONESIGNAL_APP_ID`, `ONESIGNAL_REST_API_KEY` | Push notifications to delivery agents | ❌ not yet supplied |
| `TRACKING_API_KEY` | Shared secret the customer-tracking app uses | ✅ generated — **must also be placed in the customer app's own `.env`**, it's not fetched from anywhere |
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
