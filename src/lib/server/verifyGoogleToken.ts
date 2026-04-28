import { env } from '$env/dynamic/private'

interface VerifiedGoogleUser {
	email: string
	sub: string
	emailVerified: boolean
}

const GOOGLE_CLIENT_ID = 'VITE_GOOGLE_CLIENT_ID'

export async function verifyGoogleIdToken(idToken: string): Promise<VerifiedGoogleUser> {
	if (!idToken || typeof idToken !== 'string') {
		throw new Error('Missing ID token')
	}

	const res = await fetch(
		`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`
	)

	if (!res.ok) {
		throw new Error('Google token verification failed')
	}

	const payload = await res.json()

	const expectedClientId = env[GOOGLE_CLIENT_ID] || process.env.VITE_GOOGLE_CLIENT_ID
	if (!expectedClientId) {
		throw new Error('Google client ID not configured — cannot verify token audience')
	}
	if (payload.aud !== expectedClientId) {
		throw new Error('Token audience mismatch')
	}

	if (payload.iss !== 'accounts.google.com' && payload.iss !== 'https://accounts.google.com') {
		throw new Error('Token issuer mismatch')
	}

	if (payload.email_verified !== 'true' && payload.email_verified !== true) {
		throw new Error('Email not verified')
	}

	if (!payload.email || !payload.sub) {
		throw new Error('Token missing email or sub')
	}

	return {
		email: payload.email.toLowerCase(),
		sub: payload.sub,
		emailVerified: true
	}
}
