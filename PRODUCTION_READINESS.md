# Handshake Production Readiness Plan

Last reviewed: 25 August 2026

## Product definition

Handshake should be positioned as an **assisted custodial crypto escrow service**. It temporarily safeguards a sender's crypto in a unique on-chain deposit address, waits for chain-specific finality, records the parties' instructions, and releases or refunds funds under an agreed workflow.

It is not trustless, anonymous, risk-free, insured, or a smart-contract escrow unless those properties are separately implemented and independently verified. Marketing must not promise "absolute safety". The defensible promise is: transparent custody, explicit authorization, traceable transfers, controlled release, and human dispute support.

## Current strengths

- Unique HD-derived deposit address and derivation index for each ticket/order.
- On-chain deposit monitoring with confirmation tracking.
- Sender-initiated release followed by receiver payout-address confirmation.
- Idempotent transfer records, automatic-transfer limits, manual-review states, refunds, and a global workflow pause.
- Separate public API and signing-process modes.
- Account authentication, optional 2FA, CAPTCHA, rate limiting, CSP, and moderation controls.
- Transparent tiered pricing and prepaid fee credits.

## Launch blockers

### 1. Legal and financial-crime permission

Custody is the business, not an incidental technical feature. Before accepting real customer funds, obtain jurisdiction-specific advice covering custodian-wallet-provider or equivalent registration, consumer/business contracting, safeguarding, complaints, insolvency treatment, sanctions, suspicious-activity reporting, tax records, privacy, and financial promotions.

For a UK launch, the FCA states that in-scope cryptoasset businesses must register or obtain the applicable permission and that custodian wallet providers fall within the AML/CTF regime. An application is expected to cover governance, a detailed flow of funds, transaction monitoring, Travel Rule data, outsourcing oversight, and financial promotions. Start here:

- https://www.fca.org.uk/firms/financial-crime/money-laundering-terrorist-financing/cryptoassets-aml-ctf-regime
- https://www.fca.org.uk/firms/cryptoassets/application-registration

Required business work:

- Appoint accountable compliance ownership and an MLRO/nominated officer where required.
- Select KYC/KYB, sanctions/PEP, wallet-screening, Travel Rule, case-management, and record-retention providers.
- Define prohibited countries, assets, counterparties, goods/services, transaction patterns, and source-of-funds triggers.
- Create consumer and business terms, privacy notice, custody disclosure, risk warning, complaints policy, law-enforcement process, and incident-notification process.
- Do not enable mainnet custody until counsel confirms the launch perimeter.

### 2. Key custody and wallet operations

Production private keys must never be available to the internet-facing API, its deployment platform, ordinary developers, support staff, logs, or backups. The API should hold only public addressing material and authenticated access to a private signer.

Target design:

1. API allocates a unique derivation index and asks a private signer for the matching public deposit address.
2. Watch-only monitors verify deposits through at least two independent providers for material trades.
3. Release authorization contains the exact asset, amount, destination, ticket, and authorization digest.
4. A policy engine checks ticket state, custody address, amount, destination, risk result, and approvals.
5. An HSM/MPC-backed signer signs only an approved canonical transaction.
6. An independent broadcaster submits it and reconciliation confirms it.
7. Fees and residual balances are swept to segregated treasury wallets under a documented schedule.

Operational controls:

- Separate deposit, gas, fee-revenue, operating, and reserve wallets.
- HSM/MPC or institutional custody for production signing; environment-variable mnemonics are pilot-only.
- Two-person approval for refunds, policy overrides, allowlist changes, and transfers above the automatic limit.
- Daily hot-wallet and total-custody caps, with automatic intake pause at the cap.
- Key-generation ceremony, encrypted offline backups, recovery drill, rotation procedure, and employee-access reviews.
- Daily asset-by-asset reconciliation: customer liability, confirmed deposits, pending payouts, fee liability, network cost, and treasury balance.
- A tested emergency pause that blocks new deposits without blocking safe refunds.

NIST key-management guidance is a useful baseline: https://csrc.nist.gov/Projects/Key-Management/Key-Management-Guidelines

### 3. Escrow contract and dispute mechanics

Chat plus a price is not enough to decide a real dispute. Every ticket needs a structured, immutable agreement accepted by both parties before a deposit address is shown:

- Counterparty legal/account identity and acting capacity.
- Exact goods, service, or crypto consideration.
- Quantity, quality, delivery method, destination, and deadline.
- Inspection/acceptance window and objective acceptance criteria.
- Refund, cancellation, partial-delivery, and fee rules.
- Required evidence and prohibited off-platform communication.
- Governing terms and dispute-resolution process.
- Hash and version of the accepted agreement.

Dispute operations need statuses for opened, evidence collection, response due, under review, proposed decision, appeal, and final decision. Preserve an append-only audit log. Staff must never silently edit the parties' evidence or agreement. Publish target response times, but only advertise 24/7 support if it is actually staffed.

### 4. Transaction authorization

Use "what you see is what you sign" for release and refund actions: display the asset, amount, network, full destination, fee, and consequence immediately before authorization. High-risk actions should require step-up authentication independent from the active web session. OWASP's transaction-authorization guidance is the baseline:

- https://cheatsheetseries.owasp.org/cheatsheets/Transaction_Authorization_Cheat_Sheet.html

Minimum future implementation:

- TOTP or passkeys rather than email-only 2FA.
- Step-up challenge bound cryptographically to the authorization digest.
- Destination-change cooldown and fresh authorization.
- Separate staff approval identities, immutable audit events, and no shared admin accounts.

### 5. Asset and chain scope

Do not launch every implemented asset at once. Start with one operationally simple asset and chain—normally a well-supported stablecoin on one chain—only after automatic payout, gas funding, refund, reorg, provider outage, and reconciliation tests pass. Add a chain only when it has:

- Two reliable RPC/indexing providers.
- Defined confirmation/finality policy by value band.
- Tested deposit, underpayment, overpayment, refund, payout, fee sweep, and recovery paths.
- Address and token-contract allowlists.
- Runbooks and monitoring dashboards.

This deliberate capacity is useful scarcity: customers receive a reliable service window instead of an artificial pass shortage. Publish availability and custody capacity honestly.

### 6. Customer and business adoption

Consumer essentials:

- A three-step quote before account creation: amount, asset/network, total fee, expected timing.
- Plain-language status timeline and exact next action.
- Counterparty warnings, address verification, and network mismatch prevention.
- Downloadable receipt, agreement, messages/evidence manifest, and on-chain links.
- Clear dispute button available before release—not hidden behind staff chat commands.

Business essentials:

- Organisation accounts with owner, finance, operator, auditor, and API roles.
- KYB status and configurable transaction/approval limits.
- Maker-checker payout approvals and destination allowlists.
- API keys with scopes, webhooks signed with per-customer secrets, idempotency keys, and sandbox mode.
- Invoices, reference IDs, CSV/accounting exports, monthly statements, and service-level terms.
- Dedicated support and negotiated pricing based on reviewed volume and risk—not unlimited fee waivers.

### 7. Economics and loss resilience

Track profitability per trade after RPC/indexing, gas, UTXO fees, screening, support time, chargebacks/refunds, and fee-credit liability. Credits are deferred fee revenue until used. Define:

- Minimum fee by asset/network so Handshake never subsidises ordinary chain costs unintentionally.
- Reserve policy for operational mistakes and customer remediation.
- Maximum fee-credit discount and outstanding-credit liability.
- Business subscription only when it buys concrete value: team controls, API/webhooks, reporting, priority review, and negotiated limits.
- No claim that customer assets are insured unless a named policy unambiguously covers the exact custody arrangement.

## What this hardening pass implements

- HMAC-authenticated, short-lived API-to-signer requests instead of transmitting a bearer token.
- Signer-side validation against the transfer ledger, ticket/order state, staff authority, HD-derived source address, destination authorization, escrow amount, asset, network, and derivation index.
- External signer derivation of public deposit addresses, allowing the public API to run without wallet mnemonics.
- Startup failure for unsafe signer secrets/keys and unsafe public signer URLs.
- Public API starts accepting traffic only after database and production wallet-policy validation pass; readiness and graceful shutdown are exposed.
- Launch-stage maximum trade, enhanced-authentication, per-user active exposure, and platform custody-capacity controls.
- Immutable release and payout authorization digests stored with each ticket.
- Conservative temporary limits for embedded image evidence to avoid exceeding MongoDB's document limit.
- Transparent pricing and dollar-denominated fee credits from the earlier pricing pass.

## AI transaction-safety architecture

AI should solve ambiguity and evidence problems around the underlying trade; it must never become another custody risk.

Implemented safety workflow:

1. After both users confirm the amount, one party writes structured deal terms for physical goods, digital assets, or online services.
2. The platform fingerprints the normalized agreement with SHA-256. Any revision creates a new version and invalidates the previous confirmations and AI review.
3. Both parties confirm the same fingerprint before the Safety Copilot runs.
4. Deterministic rules check missing terms, weak delivery proof, unclear ownership transfer, short inspection windows, off-platform payment diversion, wallet-secret requests, and remote-access requests.
5. When explicitly configured, a model adds a structured review. Inputs are minimized and redact wallet addresses, phone numbers, and email addresses; attachments are not sent. Provider failure falls back to rules rather than blocking availability.
6. Both parties acknowledge the same report before fee and deposit instructions unlock. The report is advisory and does not certify a counterparty or guarantee delivery.
7. Once funded or disputed, the platform can generate a neutral evidence brief that separates recorded agreement terms, ticket evidence, and on-chain facts. A trained human makes all custody decisions.

Production AI release gates still required:

- Build a labelled evaluation set from synthetic and consented historical cases, including false-positive tests for legitimate high-pressure or security-related language.
- Add prompt/model versioning, output-quality metrics, latency/cost budgets, provider-outage alerts, and a rollback switch.
- Complete a privacy impact assessment and define retention/deletion rules before sending customer content to any model provider.
- Red-team prompt injection, adversarial deal descriptions, multilingual scam wording, evidence poisoning, and attempts to make the model recommend release/refund.
- Require human approval for every dispute outcome and any restriction caused by an AI signal. Never provide the model with signer credentials or a custody tool.

## Deployment phases and release gates

### Phase 0 — non-custodial test environment

- Testnet/devnet only; no real customer value.
- CI tests for state transitions, authorization bypasses, duplicate requests, reorgs, under/overpayments, signer outages, and recovery.
- Threat model, data-flow diagram, asset/liability ledger, and incident runbooks reviewed.
- Independent security review of signer, auth, admin, and payout paths.

Exit gate: all critical/high findings fixed, restoration drill passed, and reconciliation balances to zero unexplained difference.

### Phase 1 — invitation-only mainnet pilot

- Legal/compliance approval and required registration/permission in place.
- One asset/network, low per-trade and total custody caps, named support coverage.
- Institutional/HSM/MPC signer, dual approval above a low threshold, chain analytics enabled.
- Manually approved customers, no public marketplace, no misleading safety/availability claims.

Exit gate: at least 100 completed pilot trades, no unresolved custody discrepancy, measured support/dispute workload, and successful incident simulation.

### Phase 2 — controlled consumer launch

- KYC/risk tiers, structured agreements, user-visible disputes, passkey/TOTP step-up, object-storage evidence, and append-only audit events.
- Status page, alerting, on-call rotation, backups, recovery objectives, complaints handling, and reserve policy live.
- Public quote and complete fee/network disclosure.

Exit gate: independently reviewed controls and regulator/counsel confirmation for each target market.

### Phase 3 — business product

- KYB organisations, roles/approvals, allowlists, signed webhooks, sandbox API, statements, SLA, and accounting exports.
- Volume limits and pricing are risk-reviewed per organisation.
- Add chains one at a time using the asset launch checklist.

## Non-negotiable production gate

Do not accept real customer funds merely because the application builds. Mainnet custody requires legal permission, production key custody, independent security review, AML/sanctions operations, reconciliation, staffed incident/dispute processes, and tested recovery. Until those gates are met, keep runtime ticket availability on test networks or fully paused.
