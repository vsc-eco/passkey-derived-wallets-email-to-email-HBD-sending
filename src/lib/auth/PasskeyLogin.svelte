<script lang="ts">
	import { Mail } from '@lucide/svelte'
	import { initGoogleAuth, renderGoogleButton, isInitialized, waitForGoogleUser } from './passkey/google'
	import { createNewSession, resumeExistingSession, resumeDiscoverable } from './passkey/session'
	import { loadCredential, loadCredentialByEmail } from './passkey/credential'
	import { _passkeyAuthStore, cleanUpLogout } from './store'

	const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID

	let state = $state<'idle' | 'loading' | 'email-input' | 'error'>('idle')
	let errorMsg = $state('')
	let emailInput = $state('')
	let storedCredential = $state(loadCredential())
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
				} catch (e) {
					console.warn('GSI init failed:', e)
				}
			}
		}, 200)
		return () => clearInterval(check)
	})

	$effect(() => {
		if (googleReady && googleBtnEl && !storedCredential) {
			renderGoogleButton(googleBtnEl)

			waitForGoogleUser().then(async (user) => {
				state = 'loading'
				errorMsg = ''
				try {
					// Check if this email already has a stored credential
					const existing = loadCredentialByEmail(user.email)
					if (existing) {
						const session = await resumeExistingSession(
							existing.credentialId, existing.email, existing.provider as 'google' | 'email'
						)
						setAuthenticated(session)
						return
					}

					// No stored credential — try discoverable passkey (browser may offer existing one)
					try {
						const session = await resumeDiscoverable(user.email, 'google')
						setAuthenticated(session)
						return
					} catch {
						// No existing passkey found — create new one (truly first time)
					}

					const session = await createNewSession(user, 'google')
					setAuthenticated(session)
				} catch (e) {
					state = 'error'
					errorMsg = e instanceof Error ? e.message : 'Failed to create passkey'
				}
			}).catch((e) => {
				state = 'error'
				errorMsg = e instanceof Error ? e.message : 'Google sign-in failed'
			})
		}
	})

	function setAuthenticated(session: { email: string; address: string; did: string; credentialId: string; destroy(): void }) {
		// Register email → DID in server index
		fetch('/api/email-index', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'register', email: session.email, did: session.did })
		}).catch(() => {})

		_passkeyAuthStore.set({
			status: 'authenticated',
			value: {
				username: session.email,
				address: session.address,
				did: session.did,
				provider: 'passkey',
				passkeySession: session,
				async logout() {
					session.destroy()
					_passkeyAuthStore.set({ status: 'none' })
					cleanUpLogout()
				},
				openSettings() {}
			}
		})
		state = 'idle'
	}

	async function handleResume() {
		if (!storedCredential) return
		state = 'loading'
		errorMsg = ''
		try {
			const session = await resumeExistingSession(
				storedCredential.credentialId,
				storedCredential.email,
				storedCredential.provider as 'google' | 'email'
			)
			setAuthenticated(session)
		} catch (e) {
			state = 'error'
			errorMsg = e instanceof Error ? e.message : 'Authentication failed'
			storedCredential = null
		}
	}

	async function handleEmailSignIn() {
		const email = emailInput.trim().toLowerCase()
		if (!email || !email.includes('@')) {
			errorMsg = 'Enter a valid email address'
			return
		}
		state = 'loading'
		errorMsg = ''
		try {
			const session = await createNewSession({ email }, 'email')
			setAuthenticated(session)
		} catch (e) {
			state = 'error'
			errorMsg = e instanceof Error ? e.message : 'Sign in failed'
		}
	}
</script>

{#if storedCredential && state !== 'email-input'}
	<button class="pk-btn" onclick={handleResume} disabled={state === 'loading'}>
		<Mail size={18} />
		<span class="pk-text">
			{state === 'loading' ? 'Signing in...' : `Continue as ${storedCredential.email}`}
		</span>
	</button>
{:else if state === 'email-input'}
	<div class="pk-email-wrap">
		<input
			type="email"
			placeholder="you@gmail.com"
			bind:value={emailInput}
			onkeydown={(e) => { if (e.key === 'Enter') handleEmailSignIn() }}
			class="pk-email-input"
		/>
		<button class="pk-email-go" onclick={handleEmailSignIn} disabled={state === 'loading'}>
			{state === 'loading' ? '...' : 'Go'}
		</button>
	</div>
{:else}
	<div class="pk-stack">
		{#if GOOGLE_CLIENT_ID}
			<div class="pk-google-btn" bind:this={googleBtnEl}></div>
		{/if}
		{#if state === 'loading'}
			<p class="pk-status">Creating your Magi account...</p>
		{/if}
		<button class="pk-link" onclick={() => { state = 'email-input' }}>
			<Mail size={14} /> Use email instead
		</button>
	</div>
{/if}

{#if errorMsg}
	<p class="pk-error">{errorMsg}</p>
{/if}

<style>
	.pk-stack {
		width: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.75rem;
	}
	.pk-google-btn {
		width: 100%;
		display: flex;
		justify-content: center;
		min-height: 44px;
	}
	.pk-btn {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.875rem 1rem;
		background: #1A1F35;
		border: 1px solid rgba(255, 255, 255, 0.08);
		border-radius: 12px;
		color: white;
		font-family: 'Nunito Sans', sans-serif;
		font-weight: 600;
		font-size: 0.9rem;
		cursor: pointer;
		transition: border-color 0.15s ease, box-shadow 0.15s ease;
	}
	.pk-btn:hover { border-color: rgba(99, 88, 255, 0.5); box-shadow: 0 0 20px rgba(99, 88, 255, 0.1); }
	.pk-btn:disabled { opacity: 0.5; cursor: not-allowed; }
	.pk-text { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.pk-link {
		display: flex; align-items: center; gap: 0.35rem;
		background: none; border: none;
		color: rgba(255, 255, 255, 0.35); font-size: 0.8rem;
		cursor: pointer; padding: 0.2rem 0;
	}
	.pk-link:hover { color: rgba(255, 255, 255, 0.6); }
	.pk-email-wrap { width: 100%; display: flex; gap: 0.5rem; }
	.pk-email-input {
		flex: 1; padding: 0.65rem 0.75rem;
		background: #1A1F35; border: 1px solid rgba(255, 255, 255, 0.12);
		border-radius: 10px; color: white;
		font-family: 'Nunito Sans', sans-serif; font-size: 0.85rem; outline: none;
	}
	.pk-email-input:focus { border-color: rgba(99, 88, 255, 0.5); }
	.pk-email-go {
		padding: 0.65rem 1rem;
		background: linear-gradient(135deg, #7B74FF, #5B54E0);
		border: none; border-radius: 10px; color: white;
		font-weight: 600; font-size: 0.85rem; cursor: pointer; white-space: nowrap;
	}
	.pk-email-go:disabled { opacity: 0.5; cursor: not-allowed; }
	.pk-error { color: #f44; font-size: 0.8rem; margin: 0.5rem 0 0; text-align: center; }
	.pk-status { color: rgba(255, 255, 255, 0.5); font-size: 0.8rem; margin: 0; }
</style>
