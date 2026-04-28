import { type DerivedKey, deriveKeyFromPRF } from './derive'
import { authenticateWithPRF, createPasskey } from './webauthn'
import { deriveUserId, type GoogleUser } from './google'
import { saveCredential, clearCredential } from './credential'
import { isVscTestnet } from '../../../client'

export interface PasskeySession {
	email: string
	address: string
	did: string
	credentialId: string
	provider: 'google' | 'email'
	getPrivateKey(): Uint8Array
	destroy(): void
}

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000

interface SessionState {
	key: DerivedKey
	email: string
	credentialId: string
	provider: 'google' | 'email'
	lastActivity: number
}

let activeSession: SessionState | null = null
let visibilityHandler: (() => void) | null = null

export async function createNewSession(
	user: GoogleUser | { email: string; sub?: undefined },
	provider: 'google' | 'email'
): Promise<PasskeySession> {
	const mainnet = !isVscTestnet()

	let userId: Uint8Array
	if (user.sub) {
		userId = await deriveUserId(user.sub)
	} else {
		const input = new TextEncoder().encode(`email:${user.email.toLowerCase()}`)
		const hash = await crypto.subtle.digest('SHA-256', input)
		userId = new Uint8Array(hash)
	}

	const credential = await createPasskey(user.email, userId)

	if (!credential.prfSupported) {
		throw new Error('PRF not supported on this device. Requires Chrome 116+, Safari 18+, or Edge 116+.')
	}

	const authResult = await authenticateWithPRF(credential.credentialId)
	const key = deriveKeyFromPRF(authResult.prfOutput, mainnet)

	saveCredential(credential.credentialId, user.email, provider)

	activeSession = {
		key,
		email: user.email,
		credentialId: credential.credentialId,
		provider,
		lastActivity: Date.now()
	}

	startInactivityMonitor()
	return buildSessionInterface()
}

export async function resumeExistingSession(
	credentialId: string,
	email: string,
	provider: 'google' | 'email'
): Promise<PasskeySession> {
	const mainnet = !isVscTestnet()
	const authResult = await authenticateWithPRF(credentialId)
	const key = deriveKeyFromPRF(authResult.prfOutput, mainnet)

	saveCredential(credentialId, email, provider)

	activeSession = {
		key,
		email,
		credentialId,
		provider,
		lastActivity: Date.now()
	}

	startInactivityMonitor()
	return buildSessionInterface()
}

export async function resumeDiscoverable(
	email: string,
	provider: 'google' | 'email'
): Promise<PasskeySession> {
	const mainnet = !isVscTestnet()
	const authResult = await authenticateWithPRF()
	const key = deriveKeyFromPRF(authResult.prfOutput, mainnet)

	saveCredential(authResult.credentialId, email, provider)

	activeSession = {
		key,
		email,
		credentialId: authResult.credentialId,
		provider,
		lastActivity: Date.now()
	}

	startInactivityMonitor()
	return buildSessionInterface()
}

export function getActiveSession(): PasskeySession | null {
	if (!activeSession) return null
	if (Date.now() - activeSession.lastActivity > INACTIVITY_TIMEOUT_MS) {
		destroySession()
		return null
	}
	return buildSessionInterface()
}

export function destroySession(): void {
	if (activeSession) {
		activeSession.key.privateKey.fill(0)
		activeSession = null
	}
	stopInactivityMonitor()
}

export function touchActivity(): void {
	if (activeSession) {
		activeSession.lastActivity = Date.now()
	}
}

function buildSessionInterface(): PasskeySession {
	if (!activeSession) throw new Error('No active session')
	const session = activeSession

	return {
		email: session.email,
		address: session.key.address,
		did: session.key.did,
		credentialId: session.credentialId,
		provider: session.provider,
		getPrivateKey() {
			if (!activeSession || activeSession !== session) {
				throw new Error('Session expired')
			}
			activeSession.lastActivity = Date.now()
			return session.key.privateKey
		},
		destroy() {
			clearCredential()
			if (activeSession === session) destroySession()
		}
	}
}

function startInactivityMonitor(): void {
	stopInactivityMonitor()

	visibilityHandler = () => {
		if (!document.hidden && activeSession) {
			if (Date.now() - activeSession.lastActivity > INACTIVITY_TIMEOUT_MS) {
				destroySession()
			}
		}
	}
	document.addEventListener('visibilitychange', visibilityHandler)
}

function stopInactivityMonitor(): void {
	if (visibilityHandler) {
		document.removeEventListener('visibilitychange', visibilityHandler)
		visibilityHandler = null
	}
}
