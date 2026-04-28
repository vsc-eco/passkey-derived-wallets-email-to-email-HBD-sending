<script lang="ts">
	import { ArrowRight, CheckCircle, XCircle, Clock } from '@lucide/svelte'
	import { initGoogleAuth, renderGoogleButton, waitForGoogleUser } from '$lib/auth/passkey/google'
	import { resumeExistingSession, resumeDiscoverable, createNewSession } from '$lib/auth/passkey/session'
	import { loadCredential, loadCredentialByEmail } from '$lib/auth/passkey/credential'
	import { createPasskeySigner } from '$lib/auth/passkey/signer'
	import { createClient, signAndBroadcastPasskey } from '$lib/magiTransactions/eth/client'
	import { getEVMOpType } from '$lib/magiTransactions/eth'
	import { CoinAmount } from '$lib/currency/CoinAmount'
	import { Coin, Network } from '$lib/sendswap/utils/sendOptions'
	import { getDidFromUsername } from '$lib/getAccountName'

	const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

	let { data } = $props()
	let tx = $derived(data.tx)
	let txId = $derived(data.txId)

	let step = $state<'auth' | 'review' | 'signing' | 'done' | 'error' | 'expired'>('auth')
	let statusMsg = $state('')
	let session = $state<any>(null)
	let googleBtnEl = $state<HTMLDivElement | null>(null)
	let googleReady = $state(false)

	$effect(() => {
		if (!tx) return
		if (tx.status === 'expired') { step = 'expired'; return }
		if (tx.status === 'completed') { step = 'done'; statusMsg = 'Already processed'; return }

		// Try auto-resume from stored credential
		const stored = loadCredential()
		if (stored && stored.email === tx.fromEmail) {
			step = 'review'
		}
	})

	$effect(() => {
		if (typeof window === 'undefined' || !GOOGLE_CLIENT_ID || step !== 'auth') return
		const check = setInterval(() => {
			if (window.google?.accounts?.id) {
				clearInterval(check)
				try {
					initGoogleAuth(GOOGLE_CLIENT_ID)
					googleReady = true
				} catch {}
			}
		}, 200)
		return () => clearInterval(check)
	})

	$effect(() => {
		if (googleReady && googleBtnEl && step === 'auth') {
			renderGoogleButton(googleBtnEl)
			waitForGoogleUser().then(async (user) => {
				if (user.email.toLowerCase() !== tx.fromEmail.toLowerCase()) {
					statusMsg = `Signed in as ${user.email} but this payment is from ${tx.fromEmail}`
					step = 'error'
					return
				}
				step = 'review'
			}).catch(() => {
				statusMsg = 'Sign-in failed'
				step = 'error'
			})
		}
	})

	async function handleSign() {
		step = 'signing'
		statusMsg = 'Authenticating...'

		try {
			// Resume or create passkey session
			const stored = loadCredential() ?? loadCredentialByEmail(tx.fromEmail)
			if (stored) {
				session = await resumeExistingSession(stored.credentialId, stored.email, stored.provider)
			} else {
				session = await resumeDiscoverable(tx.fromEmail, 'google')
			}

			statusMsg = 'Signing transaction...'

			const signer = createPasskeySigner(session)
			const client = createClient(session.did)

			const toDid = getDidFromUsername(tx.to)
			const coin = tx.asset === 'HBD' ? Coin.hbd : tx.asset === 'HIVE' ? Coin.hive : Coin.btc
			const sendOp = getEVMOpType(
				Network.magi, Network.magi,
				session.did, toDid,
				new CoinAmount(tx.amount, coin)
			)

			const result = await signAndBroadcastPasskey([sendOp], signer, client, undefined)

			// Mark pending tx as completed
			await fetch(`/api/pending-tx/${txId}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'complete' })
			})

			statusMsg = `${tx.amount} ${tx.asset} sent to ${tx.to}`
			step = 'done'
		} catch (e) {
			statusMsg = e instanceof Error ? e.message : 'Signing failed'
			step = 'error'
		}
	}
</script>

<div class="sign-page">
	<div class="sign-card">
		<img src="/altera_med.png" alt="Altera" class="sign-logo" />

		{#if !tx}
			<XCircle size={32} color="#f44" />
			<h2>Transaction Not Found</h2>
			<p class="sign-sub">{data.error}</p>

		{:else if step === 'expired'}
			<Clock size={32} color="#fbbf24" />
			<h2>Link Expired</h2>
			<p class="sign-sub">This payment link has expired. Send another email to try again.</p>

		{:else if step === 'auth'}
			<h2>Sign Payment</h2>
			<p class="sign-sub">Sign in to confirm sending {tx.amount} {tx.asset} to {tx.to}</p>
			<div class="google-area" bind:this={googleBtnEl}></div>

		{:else if step === 'review'}
			<h2>Confirm Payment</h2>
			<div class="tx-details">
				<div class="tx-row"><span>To</span><strong>{tx.to}</strong></div>
				<div class="tx-row"><span>Amount</span><strong>{tx.amount} {tx.asset}</strong></div>
				{#if tx.message}
					<div class="tx-row"><span>Message</span><span class="msg">{tx.message}</span></div>
				{/if}
			</div>
			<button class="sign-btn" onclick={handleSign}>
				Sign and Send <ArrowRight size={16} />
			</button>
			<p class="sign-note">This will prompt for your fingerprint or face scan.</p>

		{:else if step === 'signing'}
			<h2>Processing...</h2>
			<p class="sign-sub">{statusMsg}</p>

		{:else if step === 'done'}
			<CheckCircle size={32} color="#4ade80" />
			<h2>Sent!</h2>
			<p class="sign-sub">{statusMsg}</p>
			<a href="/" class="sign-btn">Open Altera</a>

		{:else if step === 'error'}
			<XCircle size={32} color="#f44" />
			<h2>Error</h2>
			<p class="sign-error">{statusMsg}</p>
			<button class="sign-btn" onclick={() => { step = 'review' }}>Try again</button>
		{/if}
	</div>
</div>

<style>
	.sign-page {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #07070E;
		padding: 1rem;
	}
	.sign-card {
		max-width: 400px;
		width: 100%;
		background: linear-gradient(135deg, rgba(99,88,255,0.06), rgba(99,88,255,0.02)), #0F1225;
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 16px;
		padding: 2rem;
		text-align: center;
		color: #E8E6F0;
		font-family: 'Nunito Sans', sans-serif;
	}
	.sign-logo {
		width: 32px; height: 32px;
		filter: invert(1) brightness(2);
		margin-bottom: 1rem;
	}
	h2 { font-size: 1.25rem; font-weight: 700; margin: 0.5rem 0; }
	.sign-sub { font-size: 0.85rem; color: rgba(255,255,255,0.5); margin: 0.25rem 0; }
	.sign-error { color: #f44; font-size: 0.85rem; }
	.sign-note { font-size: 0.75rem; color: rgba(255,255,255,0.3); margin-top: 0.75rem; }
	.google-area { display: flex; justify-content: center; margin: 1.5rem 0; min-height: 44px; }
	.tx-details {
		background: rgba(255,255,255,0.03);
		border: 1px solid rgba(255,255,255,0.08);
		border-radius: 12px;
		padding: 1rem;
		margin: 1rem 0;
		text-align: left;
	}
	.tx-row {
		display: flex;
		justify-content: space-between;
		padding: 0.35rem 0;
		font-size: 0.85rem;
	}
	.tx-row span { color: rgba(255,255,255,0.5); }
	.tx-row strong { color: white; }
	.tx-row .msg { color: rgba(255,255,255,0.6); font-style: italic; max-width: 200px; text-align: right; }
	.sign-btn {
		display: inline-flex; align-items: center; gap: 0.4rem;
		padding: 0.7rem 1.5rem; margin-top: 0.75rem;
		background: linear-gradient(135deg, #7B74FF, #5B54E0);
		color: white; border: none; border-radius: 2rem;
		font-weight: 700; font-size: 0.9rem; cursor: pointer;
		text-decoration: none;
	}
	.sign-btn:hover { box-shadow: 0 4px 20px rgba(111,106,248,0.4); }
</style>
