import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { createEscrow } from '$lib/server/escrowStore'
import { checkRateLimit } from '$lib/server/rateLimit'

const MAX_ESCROWS_PER_SENDER = 10
const MAX_ESCROWS_PER_TARGET = 5
const WINDOW_MS = 60 * 60 * 1000

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	const body = await request.json()
	const { email, amount, asset, senderDid } = body

	if (!email || typeof email !== 'string' || !email.includes('@')) {
		return json({ error: 'Valid email required' }, { status: 400 })
	}
	if (!amount || !asset || !senderDid) {
		return json({ error: 'amount, asset, senderDid required' }, { status: 400 })
	}

	const ip = getClientAddress()
	if (!checkRateLimit(`escrow:ip:${ip}`, MAX_ESCROWS_PER_SENDER, WINDOW_MS)) {
		return json({ error: 'Rate limit exceeded' }, { status: 429 })
	}

	const targetKey = email.toLowerCase()
	if (!checkRateLimit(`escrow:target:${targetKey}`, MAX_ESCROWS_PER_TARGET, WINDOW_MS)) {
		return json({ error: 'Too many escrows for this recipient' }, { status: 429 })
	}

	const record = createEscrow(email, amount, asset, senderDid)

	return json({
		nonce: record.nonce,
		emailHash: record.emailHash,
		expiresAt: record.expiresAt
	})
}
