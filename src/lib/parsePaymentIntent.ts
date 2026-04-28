export interface PaymentIntent {
	recipient: string
	amount: number
	asset: string
	message: string
}

const SUPPORTED_ASSETS = new Set(['HBD', 'HIVE', 'BTC', 'ETH', 'USDC'])

export function parsePaymentIntent(text: string): PaymentIntent | null {
	const clean = text.replace(/\s+/g, ' ').trim()
	if (!clean) return null

	// Pattern 1: "pay RECIPIENT AMOUNT ASSET [message]"
	const payFirst = clean.match(
		/^(?:pay|send)\s+(\S+)\s+(\d+\.?\d*)\s+([A-Za-z]+)(?:\s+(.*))?$/i
	)
	if (payFirst) {
		const asset = payFirst[3].toUpperCase()
		if (!SUPPORTED_ASSETS.has(asset)) return null
		return {
			recipient: payFirst[1],
			amount: parseFloat(payFirst[2]),
			asset,
			message: (payFirst[4] ?? '').trim()
		}
	}

	// Pattern 2: "send AMOUNT ASSET to RECIPIENT [message]"
	const sendTo = clean.match(
		/^(?:send|pay)\s+(\d+\.?\d*)\s+([A-Za-z]+)\s+to\s+(\S+)(?:\s+(.*))?$/i
	)
	if (sendTo) {
		const asset = sendTo[2].toUpperCase()
		if (!SUPPORTED_ASSETS.has(asset)) return null
		return {
			recipient: sendTo[3],
			amount: parseFloat(sendTo[1]),
			asset,
			message: (sendTo[4] ?? '').trim()
		}
	}

	return null
}
