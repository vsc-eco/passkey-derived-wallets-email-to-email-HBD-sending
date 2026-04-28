import { describe, it, expect } from 'vitest'
import { parsePaymentIntent } from './parsePaymentIntent'

describe('parsePaymentIntent', () => {
	it('pay email amount asset', () => {
		const r = parsePaymentIntent('pay bob@gmail.com 5 HBD')
		expect(r).toEqual({ recipient: 'bob@gmail.com', amount: 5, asset: 'HBD', message: '' })
	})

	it('send amount asset to email', () => {
		const r = parsePaymentIntent('send 5 HBD to bob@gmail.com')
		expect(r).toEqual({ recipient: 'bob@gmail.com', amount: 5, asset: 'HBD', message: '' })
	})

	it('pay hive username with message', () => {
		const r = parsePaymentIntent('pay lordbutterfly 10 HIVE hey here\'s what I owe you')
		expect(r).toEqual({
			recipient: 'lordbutterfly',
			amount: 10,
			asset: 'HIVE',
			message: "hey here's what I owe you"
		})
	})

	it('pay btc address', () => {
		const r = parsePaymentIntent(
			'pay bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq 0.001 BTC'
		)
		expect(r).toEqual({
			recipient: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq',
			amount: 0.001,
			asset: 'BTC',
			message: ''
		})
	})

	it('pay evm address', () => {
		const r = parsePaymentIntent(
			'pay 0x742d35Cc6634C0532925a3b844Bc454e4438f44e 10 USDC'
		)
		expect(r).toEqual({
			recipient: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
			amount: 10,
			asset: 'USDC',
			message: ''
		})
	})

	it('returns null for unparseable text', () => {
		expect(parsePaymentIntent('random text with no payment')).toBeNull()
	})

	it('returns null for empty string', () => {
		expect(parsePaymentIntent('')).toBeNull()
	})

	it('returns null for unsupported asset', () => {
		expect(parsePaymentIntent('pay bob@gmail.com 5 DOGE')).toBeNull()
	})

	it('handles case insensitive commands', () => {
		const r = parsePaymentIntent('PAY bob@gmail.com 5 hbd')
		expect(r).toEqual({ recipient: 'bob@gmail.com', amount: 5, asset: 'HBD', message: '' })
	})

	it('handles decimal amounts', () => {
		const r = parsePaymentIntent('pay bob@gmail.com 5.500 HBD')
		expect(r).toEqual({ recipient: 'bob@gmail.com', amount: 5.5, asset: 'HBD', message: '' })
	})

	it('send amount to hive user', () => {
		const r = parsePaymentIntent('send 100 HIVE to lordbutterfly')
		expect(r).toEqual({ recipient: 'lordbutterfly', amount: 100, asset: 'HIVE', message: '' })
	})

	it('handles extra whitespace', () => {
		const r = parsePaymentIntent('  pay   bob@gmail.com   5   HBD  ')
		expect(r).toEqual({ recipient: 'bob@gmail.com', amount: 5, asset: 'HBD', message: '' })
	})
})
