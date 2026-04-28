import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getPendingTx, completePendingTx } from '$lib/server/pendingTxStore'

export const GET: RequestHandler = async ({ params }) => {
	const tx = getPendingTx(params.id)
	if (!tx) return json({ error: 'Transaction not found' }, { status: 404 })

	return json({
		id: tx.id,
		fromEmail: tx.fromEmail,
		to: tx.to,
		amount: tx.amount,
		asset: tx.asset,
		message: tx.message,
		status: tx.status,
		expiresAt: tx.expiresAt
	})
}

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json()

	if (body.action === 'complete') {
		const ok = completePendingTx(params.id)
		if (!ok) return json({ error: 'Cannot complete — expired or already done' }, { status: 400 })
		return json({ ok: true })
	}

	return json({ error: 'Unknown action' }, { status: 400 })
}
