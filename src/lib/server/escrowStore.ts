import { keccak_256 } from '@noble/hashes/sha3'
import { loadJson, saveJson } from './persist'

export interface EscrowRecord {
	nonce: string
	email: string
	emailHash: string
	emailMasked: string
	amount: string
	asset: string
	senderDid: string
	createdAt: number
	expiresAt: number
	status: 'pending' | 'claimed' | 'expired' | 'reclaimed'
	recipientDid?: string
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000
const PURGE_AFTER_MS = 2 * 60 * 60 * 1000
const PURGE_INTERVAL_MS = 60 * 60 * 1000
const STORE_FILE = 'escrows.json'

const escrows: Map<string, EscrowRecord> = new Map(
	Object.entries(loadJson<Record<string, EscrowRecord>>(STORE_FILE, {}))
)

function flush() {
	saveJson(STORE_FILE, Object.fromEntries(escrows))
}

function purgeStale() {
	const now = Date.now()
	let purged = 0
	for (const [nonce, record] of escrows) {
		if (record.status === 'pending' && now > record.expiresAt) {
			record.status = 'expired'
		}
		if (record.status !== 'pending' && now > record.expiresAt + PURGE_AFTER_MS) {
			escrows.delete(nonce)
			purged++
		}
	}
	if (purged > 0) flush()
}

purgeStale()
setInterval(purgeStale, PURGE_INTERVAL_MS)

export function hashEmail(email: string): string {
	const bytes = new TextEncoder().encode(email.toLowerCase())
	const hash = keccak_256(bytes)
	return Array.from(hash).map(b => b.toString(16).padStart(2, '0')).join('')
}

function maskEmail(email: string): string {
	const [local, domain] = email.toLowerCase().split('@')
	if (!domain) return '***'
	return local[0] + '***@' + domain
}

export function generateNonce(): string {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function createEscrow(
	email: string,
	amount: string,
	asset: string,
	senderDid: string
): EscrowRecord {
	const nonce = generateNonce()
	const now = Date.now()

	const record: EscrowRecord = {
		nonce,
		email: email.toLowerCase(),
		emailHash: hashEmail(email),
		emailMasked: maskEmail(email),
		amount,
		asset,
		senderDid,
		createdAt: now,
		expiresAt: now + TWENTY_FOUR_HOURS_MS,
		status: 'pending'
	}

	escrows.set(nonce, record)
	flush()
	return record
}

export function getEscrow(nonce: string): EscrowRecord | null {
	return escrows.get(nonce) ?? null
}

export function claimEscrow(nonce: string, recipientDid: string): boolean {
	const record = escrows.get(nonce)
	if (!record || record.status !== 'pending') return false
	if (Date.now() > record.expiresAt) {
		record.status = 'expired'
		flush()
		return false
	}
	record.status = 'claimed'
	record.recipientDid = recipientDid
	flush()
	return true
}

export function claimAllForEmail(emailHash: string, recipientDid: string): number {
	let count = 0
	for (const record of escrows.values()) {
		if (record.emailHash === emailHash && record.status === 'pending') {
			if (Date.now() > record.expiresAt) {
				record.status = 'expired'
				continue
			}
			record.status = 'claimed'
			record.recipientDid = recipientDid
			count++
		}
	}
	if (count > 0) flush()
	return count
}

export function getPendingForEmail(emailHash: string): EscrowRecord[] {
	const results: EscrowRecord[] = []
	for (const record of escrows.values()) {
		if (record.emailHash === emailHash && record.status === 'pending') {
			if (Date.now() > record.expiresAt) {
				record.status = 'expired'
				continue
			}
			results.push(record)
		}
	}
	return results
}

export function expireEscrow(nonce: string): boolean {
	const record = escrows.get(nonce)
	if (!record || record.status !== 'pending') return false
	record.status = 'expired'
	flush()
	return true
}

export function getEscrowByEmailHash(emailHash: string): EscrowRecord | null {
	for (const record of escrows.values()) {
		if (record.emailHash === emailHash && record.status === 'pending') {
			return record
		}
	}
	return null
}
