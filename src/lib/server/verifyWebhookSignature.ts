import { createHmac, timingSafeEqual } from 'crypto'
import { env } from '$env/dynamic/private'

const TOLERANCE_SECONDS = 300

export function verifyResendWebhook(
	body: string,
	headers: { id?: string; timestamp?: string; signature?: string }
): boolean {
	const secret = env.RESEND_WEBHOOK_SECRET
	if (!secret) return false

	const { id, timestamp, signature } = headers
	if (!id || !timestamp || !signature) return false

	const ts = parseInt(timestamp, 10)
	if (isNaN(ts)) return false

	const now = Math.floor(Date.now() / 1000)
	if (Math.abs(now - ts) > TOLERANCE_SECONDS) return false

	const secretBytes = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64')
	const toSign = `${id}.${timestamp}.${body}`
	const expected = createHmac('sha256', secretBytes).update(toSign).digest('base64')

	const signatures = signature.split(' ')
	for (const sig of signatures) {
		const sigValue = sig.startsWith('v1,') ? sig.slice(3) : sig
		try {
			if (timingSafeEqual(Buffer.from(expected), Buffer.from(sigValue))) {
				return true
			}
		} catch {
			continue
		}
	}

	return false
}
