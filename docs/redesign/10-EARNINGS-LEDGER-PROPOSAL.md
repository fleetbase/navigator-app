# Driver earnings on the ledger — what exists, what is missing, what to decide

The app's H2 Earnings screen is built and gated off (`FEATURE_EARNINGS`). It reads
`GET /ledger/v1/wallet/balance` and `GET /ledger/v1/wallet/transactions` and formats
minor units once. Nothing credits a driver yet. This note is the ledger-side plan,
written from `packages/ledger/server/src` at the time of writing, for the owner to
decide on before a PR is opened.

## What already exists (verified in source)

- `WalletService::creditEarnings(Model $driver, int $amount, string $currency,
  string $description, array $options)` — deposits an `earning` transaction with
  double-entry postings (Driver Earnings Payable / Wallet Liability). Options carry
  `reference` (an order uuid) and `meta`.
- `WalletService::processPayout(Model $driver, int $amount, …)` — a `payout`
  withdrawal; throws on insufficient balance.
- Internal (console) routes: `wallets/{id}/credit|payout|freeze|unfreeze|recalculate`.
- Consumable routes under `ledger/v1/wallet` (balance, transactions, topup), subject
  resolved by `WalletApiController::resolveSubject()`.

## The defect to fix first — wallet subject: Driver or User?

`creditEarnings()` keys the wallet on the **Driver** model (`subject_type =
get_class($driver)`). `resolveSubject()` on the consumable API returns the
**User** behind a driver's Sanctum token unless `_consumer` is set on the request.
So a driver credited through `creditEarnings()` and a driver reading
`/ledger/v1/wallet/balance` can be looking at **two different wallets**, and the
app would show a zero over a real balance. Whether the `fleetbase.api` middleware
sets `_consumer` for a driver token needs confirming against the running instance
with a real driver token; nothing on this machine holds one.

**Recommendation:** key driver wallets on **Driver**, and make `resolveSubject()`
resolve the Driver for a driver credential (the `Driver` record has `user_uuid`; a
User with several Driver records across organisations must resolve to the Driver in
the *current* organisation, which is exactly the case §8a warned about). This is the
first change in the PR and the one to test end to end before anything else.

## What is missing

1. **An order-completion listener.** FleetOps broadcasts `OrderCompleted`. The
   ledger has listeners only for invoice/payment events. Add
   `Listeners/CreditDriverOnOrderCompleted` subscribed to
   `Fleetbase\FleetOps\Events\OrderCompleted`, guarded by a company setting
   (`ledger.driver_earnings.enabled`), idempotent on `order_uuid` (a completed
   order must credit once, whatever replays), calling `creditEarnings()` with
   `reference = order uuid` and `meta = { order: public_id, rule, inputs }`.
2. **A rate model.** Nothing expresses what a driver earns. Options, cheapest first:
   - **(a) Flat per order** — one company-level amount. Trivial; wrong for mixed work.
   - **(b) Per order by service rate** — FleetOps already has `service-rates` and
     `purchase-rates` on orders; a driver share (percentage or fixed) of the order's
     purchase rate. Fits the data that exists; most organisations price this way.
   - **(c) Per stop / per km** — needs the manifest's `total_distance_m` or the
     order's `distance`, both present. Good for line-haul; needs a tariff table.
   - **(d) Custom fields on the order config** — a `driver_rate` field dispatch fills
     per order. Maximum flexibility, maximum data entry.
   **Recommendation: (b) with (a) as the fallback** when an order has no rate —
   a company setting `{ mode: 'share'|'flat', share_percent, flat_amount, currency }`,
   evaluated in the listener, the inputs recorded in the transaction's `meta` so a
   driver's statement can show *why* an amount is what it is.
3. **Payout, driver-initiated.** `processPayout()` exists but only behind the
   console. If drivers may request a payout, add `POST /ledger/v1/wallet/payout`
   (amount, destination) creating a **pending** payout transaction for the console
   to approve, rather than moving money on the driver's say-so. The app's screen
   already shows payout status per transaction; a request button is a small
   addition once the route exists. Gateway choice is a separate decision.
4. **Postman.** Every new consumable route goes into the ledger collection in
   `fleetbase/postman` with a request that returns 2xx unattended (a seeded
   driver with a wallet, an order the CI completes).

## Effort

Subject fix + listener + setting + rate rule (b/a) + tests: one focused PR against
the ledger, plus a one-line FleetOps change if `OrderCompleted` needs a payload
field the listener lacks. The app needs no change beyond flipping the flag.
