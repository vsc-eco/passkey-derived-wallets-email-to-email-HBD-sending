const PRF_SALT = new TextEncoder().encode('magi-v1-secp256k1')

export interface PasskeyCreateResult {
	credentialId: string
	prfSupported: boolean
}

export interface PasskeyAuthResult {
	prfOutput: Uint8Array
	credentialId: string
}

export async function createPasskey(
	email: string,
	userId: Uint8Array
): Promise<PasskeyCreateResult> {
	const credential = (await navigator.credentials.create({
		publicKey: {
			challenge: crypto.getRandomValues(new Uint8Array(32)),
			rp: { name: 'Altera', id: window.location.hostname },
			user: {
				id: userId,
				name: email,
				displayName: email.split('@')[0]
			},
			pubKeyCredParams: [
				{ alg: -7, type: 'public-key' as const },
				{ alg: -257, type: 'public-key' as const }
			],
			authenticatorSelection: {
				residentKey: 'required',
				userVerification: 'required'
			},
			extensions: { prf: {} } as AuthenticationExtensionsClientInputs
		}
	})) as PublicKeyCredential | null

	if (!credential) throw new Error('Passkey creation cancelled')

	const extensions = credential.getClientExtensionResults() as Record<string, unknown>
	const prfEnabled = (extensions?.prf as { enabled?: boolean })?.enabled === true

	return {
		credentialId: bufferToBase64url(credential.rawId),
		prfSupported: prfEnabled
	}
}

export async function authenticateWithPRF(credentialId?: string): Promise<PasskeyAuthResult> {
	const allowCredentials = credentialId
		? [{ id: base64urlToBuffer(credentialId), type: 'public-key' as const }]
		: undefined

	const assertion = (await navigator.credentials.get({
		publicKey: {
			challenge: crypto.getRandomValues(new Uint8Array(32)),
			allowCredentials,
			userVerification: 'required',
			extensions: {
				prf: { eval: { first: PRF_SALT } }
			} as AuthenticationExtensionsClientInputs
		}
	})) as PublicKeyCredential | null

	if (!assertion) throw new Error('Authentication cancelled')

	const extensions = assertion.getClientExtensionResults() as Record<string, unknown>
	const prfResults = (extensions?.prf as { results?: { first?: ArrayBuffer } })?.results

	if (!prfResults?.first) {
		throw new Error('PRF not supported on this device. Requires Chrome 116+, Safari 18+, or Edge 116+.')
	}

	return {
		prfOutput: new Uint8Array(prfResults.first),
		credentialId: bufferToBase64url(assertion.rawId)
	}
}

function bufferToBase64url(buffer: ArrayBuffer): string {
	const bytes = new Uint8Array(buffer)
	let binary = ''
	for (const byte of bytes) binary += String.fromCharCode(byte)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function base64urlToBuffer(base64url: string): ArrayBuffer {
	const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/')
	const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
	const binary = atob(padded)
	const bytes = new Uint8Array(binary.length)
	for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
	return bytes.buffer
}
