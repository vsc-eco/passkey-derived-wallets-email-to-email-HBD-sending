import { encode } from '@ipld/dag-cbor'
import { encodePayload } from 'dag-jose-utils'
import { hashTypedData } from 'viem'
import * as secp from '@noble/secp256k1'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'
import { convertCBORToEIP712TypedData } from '$lib/magiTransactions/eth/cbor_to_eip712_converter'
import type { Signer, VSCTransactionSigningShell, Client, SignedTransaction } from '$lib/magiTransactions/eth/client'
import { type PasskeySession } from './session'

if (!secp.etc.hmacSha256Sync) {
	secp.etc.hmacSha256Sync = (k: Uint8Array, ...m: Uint8Array[]) =>
		hmac(sha256, k, secp.etc.concatBytes(...m))
}

export function createPasskeySigner(session: PasskeySession): Signer {
	return async (
		signingShell: VSCTransactionSigningShell,
		client: Client
	): Promise<SignedTransaction> => {
		if (!signingShell?.__t || !signingShell?.headers || !signingShell?.tx) {
			throw new Error('Invalid signing shell structure')
		}

		const privateKey = session.getPrivateKey()
		const encodedShell = encode(signingShell)

		const typedData = convertCBORToEIP712TypedData(
			'vsc.network',
			encodedShell,
			'tx_container_v0'
		)

		const hash = hashTypedData(typedData as Parameters<typeof hashTypedData>[0])

		const hashBytes = hexToBytes(hash)
		const sig = secp.sign(hashBytes, privateKey)

		const r = sig.r.toString(16).padStart(64, '0')
		const s = sig.s.toString(16).padStart(64, '0')
		const v = sig.recovery === 0 ? '1b' : '1c'

		const signatureHex = '0x' + r + s + v

		const sigs = [{ alg: 'EdDSA', kid: client.userId, sig: signatureHex }]
		const rawTx = (await encodePayload(signingShell)).linkedBlock

		return { sigs, rawTx }
	}
}

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith('0x') ? hex.slice(2) : hex
	const bytes = new Uint8Array(clean.length / 2)
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
	}
	return bytes
}
