import { hkdf } from '@noble/hashes/hkdf'
import { sha256 } from '@noble/hashes/sha256'
import { hmac } from '@noble/hashes/hmac'
import { keccak_256 } from '@noble/hashes/sha3'
import * as secp from '@noble/secp256k1'

if (!secp.etc.hmacSha256Sync) {
	secp.etc.hmacSha256Sync = (k: Uint8Array, ...m: Uint8Array[]) =>
		hmac(sha256, k, secp.etc.concatBytes(...m))
}

const SALT = new TextEncoder().encode('magi-key-derivation-v1')
const INFO_MAINNET = new TextEncoder().encode('secp256k1-mainnet')
const INFO_TESTNET = new TextEncoder().encode('secp256k1-testnet')

export interface DerivedKey {
	privateKey: Uint8Array
	publicKeyUncompressed: Uint8Array
	address: string
	did: string
}

export function deriveKeyFromPRF(prfOutput: Uint8Array, mainnet = true): DerivedKey {
	if (prfOutput.length !== 32) {
		throw new Error(`PRF output must be 32 bytes, got ${prfOutput.length}`)
	}

	const info = mainnet ? INFO_MAINNET : INFO_TESTNET
	let derived = hkdf(sha256, prfOutput, SALT, info, 32)

	let k = bytesToBigInt(derived)
	let retries = 0
	while (k === 0n || k >= secp.CURVE.n) {
		if (retries > 10) throw new Error('Key derivation failed after 10 retries')
		retries++
		const retryInfo = new TextEncoder().encode(
			`${mainnet ? 'secp256k1-mainnet' : 'secp256k1-testnet'}-retry-${retries}`
		)
		derived = hkdf(sha256, prfOutput, SALT, retryInfo, 32)
		k = bytesToBigInt(derived)
	}

	const privateKey = derived
	const publicKeyUncompressed = secp.getPublicKey(privateKey, false)
	const pubkeyHash = keccak_256(publicKeyUncompressed.slice(1))
	const addressBytes = pubkeyHash.slice(12)
	const address = '0x' + bytesToHex(addressBytes)
	const checksumAddress = toChecksumAddress(address)
	const did = `did:pkh:eip155:1:${checksumAddress}`

	return { privateKey, publicKeyUncompressed, address: checksumAddress, did }
}

function toChecksumAddress(address: string): string {
	const addr = address.toLowerCase().replace('0x', '')
	const hash = bytesToHex(keccak_256(new TextEncoder().encode(addr)))
	let checksummed = '0x'
	for (let i = 0; i < 40; i++) {
		checksummed += parseInt(hash[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i]
	}
	return checksummed
}

function bytesToBigInt(bytes: Uint8Array): bigint {
	let result = 0n
	for (const byte of bytes) {
		result = (result << 8n) | BigInt(byte)
	}
	return result
}

export function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}
