export const ssr = false

export async function load({ url, fetch }) {
	const txId = url.searchParams.get('tx')
	if (!txId) return { tx: null, error: 'No transaction ID' }

	try {
		const res = await fetch(`/api/pending-tx/${txId}`)
		if (!res.ok) {
			const data = await res.json()
			return { tx: null, error: data.error || 'Transaction not found' }
		}
		return { tx: await res.json(), txId, error: null }
	} catch {
		return { tx: null, error: 'Failed to load transaction' }
	}
}
