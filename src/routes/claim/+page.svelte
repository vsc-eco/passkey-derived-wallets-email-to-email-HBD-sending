<script lang="ts">
	import { page } from '$app/state'
	import { ArrowRight, Mail, Wallet, Bitcoin, Shield } from '@lucide/svelte'
	import { initGoogleAuth, renderGoogleButton, waitForGoogleUser } from '$lib/auth/passkey/google'
	import { createNewSession } from '$lib/auth/passkey/session'

	const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

	let { data } = $props()
	let escrow = $derived(data.escrow)
	let nonce = $derived(data.nonce)
	let error = $derived(data.error)

	let step = $state<'verify' | 'choose' | 'claiming' | 'done' | 'error'>('verify')
	let verifiedEmail = $state('')
	let googleIdToken = $state('')
	let destination = $state<'passkey' | 'hive' | 'btc' | 'evm'>('passkey')
	let addressInput = $state('')
	let statusMsg = $state('')
	let googleBtnEl = $state<HTMLDivElement | null>(null)
	let googleReady = $state(false)

	$effect(() => {
		if (typeof window === 'undefined' || !GOOGLE_CLIENT_ID) return
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
		if (googleReady && googleBtnEl && step === 'verify') {
			renderGoogleButton(googleBtnEl)
			waitForGoogleUser().then(async (user) => {
				verifiedEmail = user.email
				googleIdToken = user.idToken
				step = 'choose'
			}).catch(() => {
				statusMsg = 'Google sign-in failed'
				step = 'error'
			})
		}
	})

	function getRecipientDid(): string | null {
		if (destination === 'passkey') return null
		const addr = addressInput.trim()
		if (!addr) return null
		if (destination === 'hive') return `hive:${addr}`
		if (destination === 'btc') return `did:pkh:bip122:000000000019d6689c085ae165831e93:${addr}`
		if (destination === 'evm') return `did:pkh:eip155:1:${addr}`
		return null
	}

	async function handleClaim() {
		step = 'claiming'
		statusMsg = 'Processing claim...'

		try {
			let recipientDid: string

			if (destination === 'passkey') {
				statusMsg = 'Creating your Altera account...'
				const session = await createNewSession({ email: verifiedEmail }, 'google')
				recipientDid = session.did
			} else {
				const did = getRecipientDid()
				if (!did) { step = 'error'; statusMsg = 'Invalid address'; return }
				recipientDid = did
			}

			statusMsg = 'Releasing funds from escrow...'
			const res = await fetch(`/api/escrow/${nonce}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'claim',
					idToken: googleIdToken,
					recipientDid
				})
			})

			if (!res.ok) {
				const data = await res.json()
				throw new Error(data.error || 'Claim failed')
			}

			statusMsg = `${escrow.amount} ${escrow.asset.toUpperCase()} sent to ${destination === 'passkey' ? verifiedEmail : addressInput}`
			step = 'done'
		} catch (e) {
			statusMsg = e instanceof Error ? e.message : 'Claim failed'
			step = 'error'
		}
	}
</script>

<div class="claim-page">
	<div class="claim-card">
		<img src="/altera_med.png" alt="Altera" class="claim-logo" />

		{#if !escrow}
			<h2>Claim Not Found</h2>
			<p class="claim-sub">{error || 'Invalid or expired claim link.'}</p>
		{:else if step === 'verify'}
			<h2>You received {escrow.amount} {escrow.asset.toUpperCase()}</h2>
			<p class="claim-sub">From {escrow.senderDid.slice(0, 20)}...</p>
			<p class="claim-sub">Prove you own {escrow.emailMasked} to claim your funds.</p>
			<div class="google-btn-area" bind:this={googleBtnEl}></div>
			<p class="claim-note">
				Expires {new Date(escrow.expiresAt).toLocaleDateString()}
			</p>

		{:else if step === 'choose'}
			<h2>Verified: {verifiedEmail}</h2>
			<p class="claim-sub">Where do you want your {escrow.amount} {escrow.asset.toUpperCase()}?</p>

			<div class="dest-options">
				<label class="dest-option" class:selected={destination === 'passkey'}>
					<input type="radio" name="dest" value="passkey" bind:group={destination} />
					<Shield size={18} />
					<div>
						<strong>Create Altera account</strong>
						<span>Recommended — instant setup</span>
					</div>
				</label>
				<label class="dest-option" class:selected={destination === 'hive'}>
					<input type="radio" name="dest" value="hive" bind:group={destination} />
					<Mail size={18} />
					<div>
						<strong>Hive account</strong>
						<span>Send to your Hive username</span>
					</div>
				</label>
				<label class="dest-option" class:selected={destination === 'btc'}>
					<input type="radio" name="dest" value="btc" bind:group={destination} />
					<Bitcoin size={18} />
					<div>
						<strong>BTC wallet</strong>
						<span>Send to a Bitcoin address</span>
					</div>
				</label>
				<label class="dest-option" class:selected={destination === 'evm'}>
					<input type="radio" name="dest" value="evm" bind:group={destination} />
					<Wallet size={18} />
					<div>
						<strong>EVM wallet</strong>
						<span>Send to an Ethereum address</span>
					</div>
				</label>
			</div>

			{#if destination !== 'passkey'}
				<input
					type="text"
					class="dest-input"
					placeholder={destination === 'hive' ? 'username' : destination === 'btc' ? 'bc1q...' : '0x...'}
					bind:value={addressInput}
				/>
			{/if}

			<button class="claim-btn" onclick={handleClaim}>
				Claim {escrow.amount} {escrow.asset.toUpperCase()} <ArrowRight size={16} />
			</button>

		{:else if step === 'claiming'}
			<h2>Claiming...</h2>
			<p class="claim-sub">{statusMsg}</p>

		{:else if step === 'done'}
			<h2>Claimed!</h2>
			<p class="claim-sub">{statusMsg}</p>
			<a href="/" class="claim-btn">Open Altera</a>

		{:else if step === 'error'}
			<h2>Error</h2>
			<p class="claim-error">{statusMsg}</p>
			<button class="claim-btn" onclick={() => { step = 'verify' }}>Try again</button>
		{/if}
	</div>
</div>

<style>
	.claim-page {
		min-height: 100dvh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #07070E;
		padding: 1rem;
	}
	.claim-card {
		max-width: 420px;
		width: 100%;
		background: linear-gradient(135deg, rgba(99, 88, 255, 0.06), rgba(99, 88, 255, 0.02)), #0F1225;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 16px;
		padding: 2rem;
		text-align: center;
		color: #E8E6F0;
		font-family: 'Nunito Sans', sans-serif;
	}
	.claim-logo {
		width: 36px;
		height: 36px;
		filter: invert(1) brightness(2);
		margin-bottom: 1rem;
	}
	h2 { font-size: 1.3rem; font-weight: 700; margin: 0 0 0.5rem; }
	.claim-sub { font-size: 0.85rem; color: rgba(255,255,255,0.5); margin: 0.25rem 0; }
	.claim-note { font-size: 0.75rem; color: rgba(255,255,255,0.3); margin-top: 1rem; }
	.claim-error { color: #f44; font-size: 0.85rem; }
	.google-btn-area { display: flex; justify-content: center; margin: 1.5rem 0; min-height: 44px; }
	.dest-options { display: flex; flex-direction: column; gap: 0.5rem; margin: 1rem 0; text-align: left; }
	.dest-option {
		display: flex; align-items: center; gap: 0.75rem;
		padding: 0.75rem 1rem; border-radius: 10px; cursor: pointer;
		border: 1px solid rgba(255,255,255,0.08);
		background: rgba(255,255,255,0.03);
		transition: border-color 0.15s;
	}
	.dest-option.selected { border-color: rgba(99,88,255,0.5); background: rgba(99,88,255,0.08); }
	.dest-option input { display: none; }
	.dest-option div { display: flex; flex-direction: column; }
	.dest-option strong { font-size: 0.85rem; }
	.dest-option span { font-size: 0.7rem; color: rgba(255,255,255,0.4); }
	.dest-input {
		width: 100%; padding: 0.65rem 0.75rem; margin: 0.5rem 0;
		background: #1A1F35; border: 1px solid rgba(255,255,255,0.12);
		border-radius: 10px; color: white; font-size: 0.85rem;
		font-family: 'Nunito Sans', sans-serif; outline: none; box-sizing: border-box;
	}
	.dest-input:focus { border-color: rgba(99,88,255,0.5); }
	.claim-btn {
		display: inline-flex; align-items: center; gap: 0.4rem;
		padding: 0.7rem 1.5rem; margin-top: 1rem;
		background: linear-gradient(135deg, #7B74FF, #5B54E0);
		color: white; border: none; border-radius: 2rem;
		font-weight: 700; font-size: 0.9rem; cursor: pointer;
		text-decoration: none;
	}
	.claim-btn:hover { box-shadow: 0 4px 20px rgba(111,106,248,0.4); }
</style>
