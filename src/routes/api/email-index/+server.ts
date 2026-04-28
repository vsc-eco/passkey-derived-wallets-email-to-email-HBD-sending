import { json } from '@sveltejs/kit'
import type { RequestHandler } from './$types'
import { resolveEmail } from '$lib/server/emailIndex'

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json()
	const { action, email } = body

	if (!email || typeof email !== 'string' || !email.includes('@')) {
		return json({ error: 'Valid email required' }, { status: 400 })
	}

	if (action === 'resolve') {
		const resolved = resolveEmail(email)
		return json({ did: resolved })
	}

	return json({ error: 'Unknown action' }, { status: 400 })
}
