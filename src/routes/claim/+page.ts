export const ssr = false

export async function load({ url, fetch }) {
	const nonce = url.searchParams.get('nonce')
	const eh = url.searchParams.get('eh')
	if (!nonce) return { escrow: null, error: 'No claim nonce provided' }

	try {
		const params = eh ? `?eh=${encodeURIComponent(eh)}` : ''
		const res = await fetch(`/api/escrow/${nonce}${params}`)
		if (!res.ok) {
			const data = await res.json()
			return { escrow: null, error: data.error || 'Escrow not found' }
		}
		const escrow = await res.json()
		return { escrow, nonce, error: null }
	} catch {
		return { escrow: null, error: 'Failed to load claim details' }
	}
}
