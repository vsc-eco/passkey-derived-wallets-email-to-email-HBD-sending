# Passkey-Derived Wallets + Email-to-Email HBD Payments

  Gmail-based passkey authentication and email escrow payment system for
  [Altera](https://github.com/vsc-eco/altera-app). These files integrate into the altera-app SvelteKit project.

  ## What this does

  - **Passkey auth:** Gmail OAuth → WebAuthn PRF → HKDF → secp256k1 private key → `did:pkh:eip155:1:{address}`
  - **Send-to-email:** Type any email address in the send UI → funds deposited to on-chain escrow contract → recipient
  gets claim email
  - **Claim flow:** Recipient clicks link → Google Sign-In (server-verified) → funds released to their chosen
  destination (passkey account, Hive, BTC, or EVM)
  - **Accumulating escrow:** Multiple senders to same email, single claim releases all. 24-hour expiry with sender
  reclaim.
  - **Inbound email payments:** Send email with "pay bob@gmail.com 5 HBD" in body → parsed → escrow created

  ## Security

  Two-pass hostile audit, 12 findings identified and fixed:
  - Server-side Google ID token verification (tokeninfo + aud/iss/email_verified, fails closed)
  - Resend webhook Svix HMAC-SHA256 signature verification
  - HTML escaping on all email template interpolation
  - Rate limiting on escrow creation and email sending
  - Oracle nonce mutex for concurrent submissions
  - Data persistence outside web root with atomic writes + backup recovery
  - Expired record purge on startup + hourly

  ## Integration into altera-app

  This repo contains 43 files that integrate into `vsc-eco/altera-app`. The directory structure mirrors altera-app
  exactly.

  ### NEW files (27) — copy directly into altera-app

**Passkey auth core** (`src/lib/auth/passkey/`)

| File | Description |
|------|-------------|
| `derive.ts` | PRF > HKDF > secp256k1 key derivation |
| `webauthn.ts` | WebAuthn passkey create + PRF authenticate |
| `google.ts` | Google Sign-In (GSI) initialization + JWT parse |
| `credential.ts` | localStorage credential persistence |
| `session.ts` | Session management + inactivity timeout |
| `signer.ts` | Drop-in transaction signer using passkey |

**Passkey login component**

| File | Description |
|------|-------------|
| `src/lib/auth/PasskeyLogin.svelte` | Login component with Google button |

**Server modules** (`src/lib/server/`)

| File | Description |
|------|-------------|
| `oracleSigner.ts` | Server-side Magi tx signing for escrow oracle |
| `escrowStore.ts` | Escrow record storage with JSON persistence |
| `emailIndex.ts` | Email to DID mapping store |
| `pendingTxStore.ts` | Pending tx store for inbound email payments |
| `persist.ts` | Atomic JSON file persistence (write .tmp then rename) |
| `verifyGoogleToken.ts` | Server-side Google ID token verification |
| `verifyWebhookSignature.ts` | Resend Svix webhook HMAC verification |
| `rateLimit.ts` | Sliding window rate limiter |

**Payment intent parser**

| File | Description |
|------|-------------|
| `src/lib/parsePaymentIntent.ts` | "pay bob@gmail.com 5 HBD" parser |
| `src/lib/parsePaymentIntent.test.ts` | 12 parser test cases |

**API endpoints** (`src/routes/api/`)

| File | Description |
|------|-------------|
| `escrow/+server.ts` | POST: create escrow record |
| `escrow/[nonce]/+server.ts` | GET: escrow details, POST: claim/reclaim |
| `send-claim-email/+server.ts` | POST: send claim notification email |
| `inbound-email/+server.ts` | POST: Resend webhook for inbound email payments |
| `email-index/+server.ts` | POST: resolve email to DID |
| `pending-tx/[id]/+server.ts` | GET/POST: pending tx for email payments |

**Pages** (`src/routes/`)

| File | Description |
|------|-------------|
| `claim/+page.svelte` | Claim page UI (Google OAuth + destination picker) |
| `claim/+page.ts` | Claim page loader |
| `sign/+page.svelte` | Sign page for email payment confirmation |
| `sign/+page.ts` | Sign page loader |

---

### MODIFIED files (16) — merge into altera-app current main

These files have changes relative to altera-app main as of 2026-04-28. **Diff against current main before applying.**

| File | What changed |
|------|-------------|
| `.gitignore` | Added .data exclusion |
| `package.json` | Added @noble/hashes, @noble/secp256k1 dependencies |
| `pnpm-lock.yaml` | Lockfile update for new deps |
| `src/app.html` | Added Google Sign-In (GSI) script tag |
| `src/hooks.server.ts` | Added /.data and /.env path blocking |
| `src/lib/auth/store.ts` | Added 'passkey' provider type + _passkeyAuthStore |
| `src/lib/constants.ts` | Added ESCROW_CONTRACT_ID |
| `src/lib/getAccountName.ts` | Added passkey case |
| `src/lib/Topbar/Topbar.svelte` | Email display for passkey users |
| `src/lib/cards/QuickSwap.svelte` | Passkey signer for swaps |
| `src/lib/magiTransactions/eth/client.ts` | Added signAndBroadcastPasskey + CallContractTransaction export |
| `src/lib/magiTransactions/hive/vscOperations/StakeHBDModal.svelte` | Passkey signer for staking |
| `src/lib/sendswap/contacts/ContactSearchBox.svelte` | Email address detection |
| `src/lib/sendswap/utils/sendUtils.ts` | Email to escrow send flow |
| `src/routes/(authed)/+layout.svelte` | Email display for passkey auth |
| `src/routes/login/+page.svelte` | PasskeyLogin component in login modal |

---

## Environment variables needed

| Variable | Description |
|----------|-------------|
| `VITE_GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `RESEND_API_KEY` | Resend API key for sending emails |
| `ORACLE_PRIVATE_KEY` | 64-char hex, secp256k1 private key for escrow oracle |
| `ESCROW_CONTRACT_ID` | Magi contract ID, set after deploy |
| `RESEND_WEBHOOK_SECRET` | From Resend dashboard, for inbound email verification |
| `MAGI_GQL_URL` | Blank for mainnet, set for testnet |
| `MAGI_NET_ID` | Blank for mainnet, set for testnet |
  ## Environment variables needed

  VITE_GOOGLE_CLIENT_ID=
  RESEND_API_KEY=
  ORACLE_PRIVATE_KEY=<64-char hex, secp256k1 private key for escrow oracle>
  ESCROW_CONTRACT_ID=<Magi contract ID, set after deploy>
  RESEND_WEBHOOK_SECRET=<from Resend dashboard, for inbound email>
  MAGI_GQL_URL=<blank for mainnet, set for testnet>
  MAGI_NET_ID=<blank for mainnet, set for testnet>

  ## Escrow contract

  WASM compiled (189KB, tinygo 0.34.0). Source: separate repo. Needs deployment via `contract-deployer` before on-chain
  calls work. System gracefully stubs when `ESCROW_CONTRACT_ID` is empty.

  Oracle DID: `did:pkh:eip155:1:0x69aB7d0f7fc088A1C3c6F3DD9aE1BEbB3Ce8B866`

  After contract deploy: call `setOracle` with the oracle DID, fund it with HBD for RCs.

  ## Blocking

  1. Deploy escrow contract → set `ESCROW_CONTRACT_ID`
  2. Call `setOracle` on contract with oracle DID
  3. Fund oracle DID with HBD (needs RCs to submit claim txs)
  4. Domain with MX records → Resend for inbound email (only needed for email-to-email, not UI send flow)


