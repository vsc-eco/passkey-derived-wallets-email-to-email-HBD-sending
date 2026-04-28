import { vscNetworkId } from '../../../client'

export interface StoredCredential {
	credentialId: string
	email: string
	provider: 'google' | 'email'
	createdAt: number
}

function storageKey(): string {
	const network = vscNetworkId === 'vsc-testnet' ? 'testnet' : 'mainnet'
	return `magi_passkey_${network}`
}

function emailStorageKey(email: string): string {
	const network = vscNetworkId === 'vsc-testnet' ? 'testnet' : 'mainnet'
	return `magi_passkey_${network}_${email.toLowerCase()}`
}

export function saveCredential(credentialId: string, email: string, provider: 'google' | 'email'): void {
	const data: StoredCredential = {
		credentialId,
		email: email.toLowerCase(),
		provider,
		createdAt: Date.now()
	}
	const json = JSON.stringify(data)
	localStorage.setItem(storageKey(), json)
	localStorage.setItem(emailStorageKey(email), json)
}

export function loadCredential(): StoredCredential | null {
	const raw = localStorage.getItem(storageKey())
	if (!raw) return null
	try {
		const data = JSON.parse(raw) as StoredCredential
		if (!data.credentialId || !data.email) return null
		return data
	} catch {
		return null
	}
}

export function loadCredentialByEmail(email: string): StoredCredential | null {
	const raw = localStorage.getItem(emailStorageKey(email))
	if (!raw) return null
	try {
		const data = JSON.parse(raw) as StoredCredential
		if (!data.credentialId || !data.email) return null
		return data
	} catch {
		return null
	}
}

export function clearCredential(): void {
	const existing = loadCredential()
	localStorage.removeItem(storageKey())
	// Keep the email-keyed entry so we can find the credential on re-login
}
