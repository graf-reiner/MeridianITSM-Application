import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
} from '@simplewebauthn/types';

const RP_NAME = 'MeridianITSM';
const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'localhost';
const ORIGIN = process.env.NEXTAUTH_URL ?? 'http://localhost:3000';

/**
 * Generate WebAuthn registration options for a user.
 * excludeCredentials prevents re-registering already-enrolled authenticators.
 */
export async function generateWebAuthnRegistration(
  userId: string,
  userEmail: string,
  existingCredentials: { id: string; transports?: string[] }[],
) {
  return generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: RP_ID,
    userID: new TextEncoder().encode(userId),
    userName: userEmail,
    attestationType: 'none',
    excludeCredentials: existingCredentials.map((c) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransport[],
    })),
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
  });
}

/**
 * Verify a WebAuthn registration response from the browser.
 */
export async function verifyWebAuthnRegistrationResponse(
  response: RegistrationResponseJSON,
  expectedChallenge: string,
) {
  return verifyRegistrationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
  });
}

/**
 * Generate WebAuthn authentication options (for MFA challenge during login).
 */
export async function generateWebAuthnAuthenticationOpts(
  allowCredentials: { id: string; transports?: string[] }[],
) {
  return generateAuthenticationOptions({
    rpID: RP_ID,
    allowCredentials: allowCredentials.map((c) => ({
      id: c.id,
      transports: c.transports as AuthenticatorTransport[],
    })),
    userVerification: 'preferred',
  });
}

/**
 * Verify a WebAuthn authentication response (during MFA challenge verification).
 */
export async function verifyWebAuthnAuthenticationResponse(
  response: AuthenticationResponseJSON,
  expectedChallenge: string,
  credentialPublicKey: Uint8Array,
  credentialCounter: bigint,
) {
  return verifyAuthenticationResponse({
    response,
    expectedChallenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    credential: {
      id: response.id,
      publicKey: credentialPublicKey,
      counter: Number(credentialCounter),
    } as any,
  });
}
