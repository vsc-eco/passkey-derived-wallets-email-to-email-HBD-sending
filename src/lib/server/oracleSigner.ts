import { encodePayload } from 'dag-jose-utils'
import { encode as encodeDagCbor } from '@ipld/dag-cbor'
import { hashTypedData } from 'viem'
import * as secp from '@noble/secp256k1'
import { hmac } from '@noble/hashes/hmac'
import { sha256 } from '@noble/hashes/sha256'
import { keccak_256 } from '@noble/hashes/sha3'
import { encode as encodeCborg } from '$lib/magiTransactions/eth/cborg_utils/encode'
import { decode as decodeCborg } from '$lib/magiTransactions/eth/cborg_utils/decode'
import { convertCBORToEIP712TypedData } from '$lib/magiTransactions/eth/cbor_to_eip712_converter'
import { env } from '$env/dynamic/private'

if (!secp.etc.hmacSha256Sync) {
	secp.etc.hmacSha256Sync = (k: Uint8Array, ...m: Uint8Array[]) =>
		hmac(sha256, k, secp.etc.concatBytes(...m))
}

function getMagiApi(): string {
	return env.MAGI_GQL_URL || 'https://api.vsc.eco/api/v1/graphql'
}

function getNetId(): string {
	return env.MAGI_NET_ID || 'vsc-mainnet'
}

function getOracleKey(): Uint8Array {
	const hex = env.ORACLE_PRIVATE_KEY
	if (!hex || hex.length !== 64) {
		throw new Error('ORACLE_PRIVATE_KEY must be a 64-char hex string')
	}
	return hexToBytes(hex)
}

function getOracleDid(): string {
	const privKey = getOracleKey()
	const pubUncompressed = secp.getPublicKey(privKey, false)
	const pubHash = keccak_256(pubUncompressed.slice(1))
	const addrBytes = pubHash.slice(12)
	const addr = '0x' + bytesToHex(addrBytes)
	return `did:pkh:eip155:1:${toChecksumAddress(addr)}`
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

function hexToBytes(hex: string): Uint8Array {
	const clean = hex.startsWith('0x') ? hex.slice(2) : hex
	const bytes = new Uint8Array(clean.length / 2)
	for (let i = 0; i < bytes.length; i++) {
		bytes[i] = parseInt(clean.substring(i * 2, i * 2 + 2), 16)
	}
	return bytes
}

function bytesToHex(bytes: Uint8Array): string {
	return Array.from(bytes)
		.map((b) => b.toString(16).padStart(2, '0'))
		.join('')
}

function uint8ArrayToBase64(arr: Uint8Array): string {
	let bin = ''
	arr.forEach((b) => (bin += String.fromCharCode(b)))
	return btoa(bin)
}

function sortKeys(obj: unknown): unknown {
	if (Array.isArray(obj)) return obj.map(sortKeys)
	if (typeof obj !== 'object' || obj === null) return obj
	const sorted: Record<string, unknown> = {}
	for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
		sorted[key] = sortKeys((obj as Record<string, unknown>)[key])
	}
	return sorted
}

async function fetchNonce(did: string): Promise<number> {
	const res = await fetch(getMagiApi(), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query: `query($account: String!) { getAccountNonce(account: $account) { nonce } }`,
			variables: { account: did }
		})
	})
	const json = await res.json()
	return json.data?.getAccountNonce?.nonce ?? 0
}

async function submitTx(txEncoded: string, sigEncoded: string): Promise<string> {
	const res = await fetch(getMagiApi(), {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			query: `query($tx: String!, $sig: String!) { submitTransactionV1(tx: $tx, sig: $sig) { id } }`,
			variables: { tx: txEncoded, sig: sigEncoded }
		})
	})
	const json = await res.json()
	const id = json.data?.submitTransactionV1?.id
	if (!id) {
		throw new Error(`Magi tx submit failed: ${JSON.stringify(json.errors ?? json)}`)
	}
	return id
}

let oracleMutex: Promise<void> = Promise.resolve()

async function withOracleLock<T>(fn: () => Promise<T>): Promise<T> {
	let release: () => void
	const prev = oracleMutex
	oracleMutex = new Promise((r) => (release = r))
	await prev
	try {
		return await fn()
	} finally {
		release!()
	}
}

async function signAndSubmitContractCall(
	contractId: string,
	action: string,
	payload: Record<string, unknown>
): Promise<string> {
	const oracleDid = getOracleDid()
	const privKey = getOracleKey()
	const nonce = await fetchNonce(oracleDid)

	const callPayload = {
		action,
		caller: oracleDid,
		contract_id: contractId,
		intents: [],
		payload: JSON.stringify(payload),
		rc_limit: 500
	}

	const encodedPayload = encodeCborg(callPayload)

	const txContainer = {
		__t: 'vsc-tx',
		__v: '0.2',
		headers: {
			nonce,
			required_auths: [oracleDid],
			rc_limit: 500,
			net_id: getNetId()
		},
		tx: [{ type: 'call', payload: encodedPayload }]
	}

	const signingShell = {
		__t: txContainer.__t,
		__v: txContainer.__v,
		headers: { ...txContainer.headers },
		tx: txContainer.tx.map((op) => ({
			type: op.type,
			payload: JSON.stringify(sortKeys(decodeCborg(op.payload)))
		}))
	}

	const encodedShell = encodeDagCbor(signingShell)
	const typedData = convertCBORToEIP712TypedData('vsc.network', encodedShell, 'tx_container_v0')
	const hash = hashTypedData(typedData as Parameters<typeof hashTypedData>[0])
	const hashBytes = hexToBytes(hash)
	const sig = secp.sign(hashBytes, privKey)

	const r = sig.r.toString(16).padStart(64, '0')
	const s = sig.s.toString(16).padStart(64, '0')
	const v = sig.recovery === 0 ? '1b' : '1c'
	const signatureHex = '0x' + r + s + v

	const sigs = [{ alg: 'EdDSA', kid: oracleDid, sig: signatureHex }]

	const sigEncoded = uint8ArrayToBase64(
		(await encodePayload({ __t: 'vsc-sig', sigs })).linkedBlock
	)
	const txEncoded = uint8ArrayToBase64(
		(await encodePayload(txContainer)).linkedBlock
	)

	return submitTx(txEncoded, sigEncoded)
}

export async function callEscrowClaim(
	escrowContractId: string,
	emailHash: string,
	recipientDid: string,
	email: string
): Promise<string> {
	return withOracleLock(() =>
		signAndSubmitContractCall(escrowContractId, 'claim', {
			email_hash: emailHash,
			recipient: recipientDid,
			email
		})
	)
}

export { getOracleDid }
