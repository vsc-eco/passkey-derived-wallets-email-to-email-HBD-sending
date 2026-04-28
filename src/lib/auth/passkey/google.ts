export interface GoogleUser {
	email: string
	sub: string
	idToken: string
}

declare global {
	interface Window {
		google?: {
			accounts: {
				id: {
					initialize(config: {
						client_id: string
						callback: (response: { credential: string }) => void
						auto_select?: boolean
						context?: string
						ux_mode?: string
					}): void
					prompt(notification?: (n: { isNotDisplayed(): boolean; isSkippedMoment(): boolean }) => void): void
					renderButton(
						parent: HTMLElement,
						options: { theme?: string; size?: string; text?: string; shape?: string; width?: number }
					): void
					cancel(): void
				}
			}
		}
	}
}

let resolveLogin: ((user: GoogleUser) => void) | null = null
let rejectLogin: ((err: Error) => void) | null = null
let initialized = false

export function initGoogleAuth(clientId: string): void {
	if (initialized) return
	if (!window.google?.accounts?.id) {
		throw new Error(
			'Google Identity Services script not loaded. Add <script src="https://accounts.google.com/gsi/client" async></script> to app.html'
		)
	}

	window.google.accounts.id.initialize({
		client_id: clientId,
		callback: handleCredentialResponse,
		context: 'signin',
		ux_mode: 'popup'
	})
	initialized = true
}

export function renderGoogleButton(element: HTMLElement): void {
	if (!initialized) return

	window.google!.accounts.id.renderButton(element, {
		theme: 'filled_black',
		size: 'large',
		text: 'continue_with',
		shape: 'pill',
		width: 320
	})
}

export function isInitialized(): boolean {
	return initialized
}

export function waitForGoogleUser(): Promise<GoogleUser> {
	return new Promise((resolve, reject) => {
		resolveLogin = resolve
		rejectLogin = reject
	})
}

function handleCredentialResponse(response: { credential: string }) {
	try {
		const user = parseIdToken(response.credential)
		user.idToken = response.credential
		resolveLogin?.(user)
	} catch (e) {
		rejectLogin?.(e instanceof Error ? e : new Error(String(e)))
	} finally {
		resolveLogin = null
		rejectLogin = null
	}
}

function parseIdToken(jwt: string): GoogleUser {
	const parts = jwt.split('.')
	if (parts.length !== 3) throw new Error('Invalid JWT')

	const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))

	if (!payload.sub || typeof payload.sub !== 'string') throw new Error('Missing sub in id_token')
	if (!payload.email || typeof payload.email !== 'string') throw new Error('Missing email in id_token')
	if (payload.email_verified !== true) throw new Error('Email not verified')

	return {
		email: payload.email.toLowerCase(),
		sub: payload.sub,
		idToken: ''
	}
}

export async function deriveUserId(sub: string): Promise<Uint8Array> {
	const input = new TextEncoder().encode(`google:${sub}`)
	const hash = await crypto.subtle.digest('SHA-256', input)
	return new Uint8Array(hash)
}
