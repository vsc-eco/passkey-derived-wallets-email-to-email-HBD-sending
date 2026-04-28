export interface PendingTx {
	id: string
	fromEmail: string
	fromDid: string
	to: string
	amount: number
	asset: string
	message: string
	status: 'pending_signature' | 'completed' | 'expired'
	createdAt: number
	expiresAt: number
}

const EXPIRY_MS = 10 * 60 * 1000
const MAX_PER_SENDER_DAY = 10

const store = new Map<string, PendingTx>()
const dailyCounts = new Map<string, { count: number; resetAt: number }>()

export function generateTxId(): string {
	const bytes = new Uint8Array(16)
	crypto.getRandomValues(bytes)
	return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function createPendingTx(
	fromEmail: string,
	fromDid: string,
	to: string,
	amount: number,
	asset: string,
	message: string
): PendingTx | { error: string } {
	const now = Date.now()
	const key = fromEmail.toLowerCase()

	// Rate limit: max 1 pending per sender
	for (const tx of store.values()) {
		if (tx.fromEmail.toLowerCase() === key && tx.status === 'pending_signature') {
			if (now < tx.expiresAt) {
				return { error: 'You already have a pending payment. Complete or wait for it to expire.' }
			}
			tx.status = 'expired'
		}
	}

	// Rate limit: max per day
	const daily = dailyCounts.get(key)
	if (daily && now < daily.resetAt && daily.count >= MAX_PER_SENDER_DAY) {
		return { error: 'Daily email payment limit reached. Try again tomorrow.' }
	}
	if (!daily || now >= daily.resetAt) {
		dailyCounts.set(key, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 })
	} else {
		daily.count++
	}

	const tx: PendingTx = {
		id: generateTxId(),
		fromEmail,
		fromDid,
		to,
		amount,
		asset: asset.toUpperCase(),
		message,
		status: 'pending_signature',
		createdAt: now,
		expiresAt: now + EXPIRY_MS
	}

	store.set(tx.id, tx)
	return tx
}

export function getPendingTx(id: string): PendingTx | null {
	const tx = store.get(id)
	if (!tx) return null
	if (tx.status === 'pending_signature' && Date.now() > tx.expiresAt) {
		tx.status = 'expired'
	}
	return tx
}

export function completePendingTx(id: string): boolean {
	const tx = store.get(id)
	if (!tx || tx.status !== 'pending_signature') return false
	if (Date.now() > tx.expiresAt) {
		tx.status = 'expired'
		return false
	}
	tx.status = 'completed'
	return true
}
