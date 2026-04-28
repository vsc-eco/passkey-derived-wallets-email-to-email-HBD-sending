import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { RESEND_API_KEY } from '$env/static/private'
import { checkRateLimit } from '$lib/server/rateLimit'

const sentNonces = new Set<string>()
const MAX_EMAILS_PER_TARGET = 3
const EMAIL_WINDOW_MS = 60 * 60 * 1000

export const POST: RequestHandler = async ({ request, url }) => {
	const body = await request.json()
	const { email, amount, asset, nonce, senderDid, emailHash } = body

	if (!email || !amount || !asset || !nonce) {
		return json({ error: 'Missing required fields' }, { status: 400 })
	}

	if (sentNonces.has(nonce)) {
		return json({ error: 'Email already sent for this nonce' }, { status: 409 })
	}

	if (!checkRateLimit(`email:target:${email.toLowerCase()}`, MAX_EMAILS_PER_TARGET, EMAIL_WINDOW_MS)) {
		return json({ error: 'Too many emails to this address' }, { status: 429 })
	}

	const ehParam = emailHash ? `&eh=${encodeURIComponent(emailHash)}` : ''
	const claimUrl = `${url.origin}/claim?nonce=${nonce}${ehParam}`
	const displayAsset = asset.toUpperCase()

	try {
		const res = await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${RESEND_API_KEY}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: 'Altera <onboarding@resend.dev>',
				to: email,
				subject: `You received ${amount} ${displayAsset} on Altera`,
				html: buildClaimEmailHtml(amount, displayAsset, senderDid, claimUrl)
			})
		})

		if (!res.ok) {
			const err = await res.json()
			console.error('Resend API error:', err)
			return json({ error: 'Failed to send email' }, { status: 502 })
		}

		const data = await res.json()
		sentNonces.add(nonce)

		return json({
			ok: true,
			messageId: data.id,
			claimUrl
		})
	} catch (err) {
		console.error('Failed to send claim email:', err)
		return json({ error: 'Email service unavailable' }, { status: 502 })
	}
}

function escapeHtml(s: string): string {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function buildClaimEmailHtml(
	amount: string,
	asset: string,
	senderDid: string,
	claimUrl: string
): string {
	const rawSender = senderDid.replace(/[^a-zA-Z0-9:._-]/g, '').slice(0, 16) + '...'
	const sender = escapeHtml(rawSender)

	const safeAmount = escapeHtml(amount)
	const safeAsset = escapeHtml(asset)
	const safeUrl = escapeHtml(claimUrl)

	return `
		<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 32px 24px;">
			<h2 style="margin: 0 0 8px; font-size: 22px; color: #111;">You received ${safeAmount} ${safeAsset}</h2>
			<p style="margin: 0 0 24px; color: #555; font-size: 15px;">From <strong>${sender}</strong> via Altera</p>
			<a href="${safeUrl}"
				style="display: inline-block; background: #111; color: #fff; padding: 14px 32px;
				border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: 500;">
				Claim your ${safeAsset}
			</a>
			<p style="margin: 24px 0 0; color: #999; font-size: 13px;">
				Claim within 24 hours or the funds return to the sender. Non-custodial — you sign with your own passkey.
			</p>
		</div>`
}
