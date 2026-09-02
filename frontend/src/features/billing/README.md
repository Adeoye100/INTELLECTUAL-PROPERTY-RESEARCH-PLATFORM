# Billing frontend boundary

The Admin-only billing screen uses the versioned backend API and Paystack's hosted checkout. It never accepts or stores card/bank credentials, never receives the Paystack secret key, and never decides the amount, currency, plan code, firm, or authorization role.

Browser capability checks and route guards are usability controls. The backend independently resolves the Supabase Bearer token to an active firm membership, requires the Admin role, scopes every query to that firm, initializes checkout with server configuration, and verifies provider state before updating a subscription.

The callback query contains only a transaction reference. The screen sends it to `POST /billing/verify`, renders the authoritative response, then removes it from the URL. A returned checkout URL is accepted only when it is HTTPS on `checkout.paystack.com`.
