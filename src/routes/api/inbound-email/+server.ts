import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { RESEND_API_KEY } from '$env/static/private'
import { resolveEmail } from '$lib/server/emailIndex'
import { parsePaymentIntent } from '$lib/parsePaymentIntent'
import { createPendingTx } from '$lib/server/pendingTxStore'
import { verifyResendWebhook } from '$lib/server/verifyWebhookSignature'

export const POST: RequestHandler = async ({ request, url, fetch: svelteFetch }) => {
	const rawBody = await request.text()

	const svixId = request.headers.get('svix-id') ?? undefined
	const svixTs = request.headers.get('svix-timestamp') ?? undefined
	const svixSig = request.headers.get('svix-signature') ?? undefined

	if (!verifyResendWebhook(rawBody, { id: svixId, timestamp: svixTs, signature: svixSig })) {
		return json({ error: 'Invalid webhook signature' }, { status: 401 })
	}

	const payload = JSON.parse(rawBody)

	if (payload.type !== 'email.received') {
		return json({ ok: true })
	}

	const emailId = payload.data?.email_id
	const fromRaw = payload.data?.from ?? ''
	const fromEmail = extractEmail(fromRaw).toLowerCase()

	if (!fromEmail || !emailId) {
		return json({ ok: true })
	}

	// Fetch full email content from Resend API
	let emailBody = ''
	const resendKey = RESEND_API_KEY
	if (resendKey) {
		try {
			const res = await fetch(`https://api.resend.com/emails/${emailId}`, {
				headers: { Authorization: `Bearer ${resendKey}` }
			})
			if (res.ok) {
				const data = await res.json()
				emailBody = data.text || data.html || ''
			}
		} catch {}
	}

	// Fallback: use subject line if body fetch fails
	if (!emailBody) {
		emailBody = payload.data?.subject ?? ''
	}

	// Check sender has Magi account
	const senderDid = resolveEmail(fromEmail)
	if (!senderDid) {
		await sendReply(
			resendKey, fromEmail,
			'No Magi account found',
			`No Magi account found for ${fromEmail}. Sign up at ${url.origin} to send payments by email.`
		)
		return json({ ok: true })
	}

	// Parse payment intent
	const intent = parsePaymentIntent(emailBody)
	if (!intent) {
		await sendReply(
			resendKey, fromEmail,
			'Could not parse payment',
			'Could not parse your payment intent.\n\nFormat: pay recipient@email.com 5 HBD\n\nExamples:\n  pay bob@gmail.com 5 HBD\n  send 10 HIVE to lordbutterfly\n  pay bc1q... 0.001 BTC'
		)
		return json({ ok: true })
	}

	// Create pending transaction
	const result = createPendingTx(
		fromEmail, senderDid,
		intent.recipient, intent.amount, intent.asset, intent.message
	)

	if ('error' in result) {
		await sendReply(resendKey, fromEmail, 'Payment not processed', result.error)
		return json({ ok: true })
	}

	// Send confirmation email with sign link
	const signUrl = `${url.origin}/sign?tx=${result.id}`
	await sendReply(
		resendKey, fromEmail,
		`Confirm: Send ${intent.amount} ${intent.asset} to ${intent.recipient}?`,
		`You requested to send ${intent.amount} ${intent.asset} to ${intent.recipient}.` +
		(intent.message ? `\n\nMessage: ${intent.message}` : '') +
		`\n\nClick to confirm and sign:\n${signUrl}` +
		`\n\nThis link expires in 10 minutes. If you did not request this, ignore this email.`
	)

	return json({ ok: true })
}

function extractEmail(from: string): string {
	const match = from.match(/<([^>]+)>/)
	if (match) return match[1]
	if (from.includes('@')) return from.trim()
	return ''
}

async function sendReply(apiKey: string | undefined, to: string, subject: string, body: string) {
	if (!apiKey) {
		console.log(`=== REPLY EMAIL ===\nTo: ${to}\nSubject: ${subject}\n${body}\n==================`)
		return
	}
	try {
		await fetch('https://api.resend.com/emails', {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify({
				from: 'Altera <onboarding@resend.dev>',
				to,
				subject,
				text: body
			})
		})
	} catch {
		console.error('Failed to send reply email to', to)
	}
}
