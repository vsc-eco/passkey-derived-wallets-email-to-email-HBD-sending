import { loadJson, saveJson } from './persist'

const STORE_FILE = 'email-index.json'

const index: Map<string, string> = new Map(
	Object.entries(loadJson<Record<string, string>>(STORE_FILE, {}))
)

function flush() {
	saveJson(STORE_FILE, Object.fromEntries(index))
}

export function registerEmail(email: string, did: string): void {
	index.set(email.toLowerCase(), did)
	flush()
}

export function resolveEmail(email: string): string | null {
	return index.get(email.toLowerCase()) ?? null
}

export function isRegistered(email: string): boolean {
	return index.has(email.toLowerCase())
}
