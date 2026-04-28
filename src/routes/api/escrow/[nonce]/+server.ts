import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { getEscrow, claimAllForEmail, hashEmail } from '$lib/server/escrowStore'
import { callEscrowClaim } from '$lib/server/oracleSigner'
import { registerEmail } from '$lib/server/emailIndex'
import { verifyGoogleIdToken } from '$lib/server/verifyGoogleToken'
import { env } from '$env/dynamic/private'

export const GET: RequestHandler = async ({ params, url }) => {
	const record = getEscrow(params.nonce)
	if (!record) {
		return json({ error: 'Escrow not found' }, { status: 404 })
	}

	const emailHash = url.searchParams.get('eh')
	if (!emailHash || emailHash !== record.emailHash) {
		return json({
			nonce: record.nonce,
			status: record.status,
			expiresAt: record.expiresAt
		})
	}

	return json({
		nonce: record.nonce,
		emailMasked: record.emailMasked,
		amount: record.amount,
		asset: record.asset,
		status: record.status,
		expiresAt: record.expiresAt,
		senderDid: record.senderDid
	})
}

export const POST: RequestHandler = async ({ params, request }) => {
	const body = await request.json()
	const { action, idToken, recipientDid, senderDid: claimedSender } = body

	if (action === 'claim') {
		if (!idToken || !recipientDid) {
			return json({ error: 'idToken and recipientDid required' }, { status: 400 })
		}

		let verifiedEmail: string
		try {
			const verified = await verifyGoogleIdToken(idToken)
			verifiedEmail = verified.email
		} catch (e) {
			return json({ error: 'Google token verification failed' }, { status: 401 })
		}

		const record = getEscrow(params.nonce)
		if (!record) {
			return json({ error: 'Escrow not found' }, { status: 404 })
		}

		if (record.status !== 'pending') {
			return json({ error: `Escrow is ${record.status}` }, { status: 400 })
		}

		if (hashEmail(verifiedEmail) !== record.emailHash) {
			return json({ error: 'Email does not match escrow' }, { status: 403 })
		}

		if (Date.now() > record.expiresAt) {
			return json({ error: 'Escrow has expired' }, { status: 400 })
		}

		let txId: string | null = null
		const escrowContractId = env.ESCROW_CONTRACT_ID
		const oracleKey = env.ORACLE_PRIVATE_KEY
		if (escrowContractId && oracleKey) {
			try {
				txId = await callEscrowClaim(
					escrowContractId,
					record.emailHash,
					recipientDid,
					record.email
				)
			} catch (e) {
				console.error('Oracle escrow claim failed:', e)
				return json({ error: 'On-chain claim failed' }, { status: 502 })
			}
		}

		const claimed = claimAllForEmail(record.emailHash, recipientDid)

		registerEmail(record.email, recipientDid)

		return json({ ok: true, recipientDid, txId, claimed, stubbed: !txId })
	}

	if (action === 'reclaim') {
		if (!claimedSender) {
			return json({ error: 'senderDid required' }, { status: 400 })
		}

		const record = getEscrow(params.nonce)
		if (!record) {
			return json({ error: 'Escrow not found' }, { status: 404 })
		}

		if (record.senderDid !== claimedSender) {
			return json({ error: 'Not the original sender' }, { status: 403 })
		}

		if (record.status !== 'pending') {
			return json({ error: `Escrow is ${record.status}` }, { status: 400 })
		}

		if (Date.now() <= record.expiresAt) {
			return json({ error: 'Escrow has not expired yet' }, { status: 400 })
		}

		record.status = 'expired'
		return json({ ok: true, status: 'expired' })
	}

	return json({ error: 'Unknown action' }, { status: 400 })
}
