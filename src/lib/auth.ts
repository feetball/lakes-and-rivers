import { NextRequest } from 'next/server';
import { timingSafeEqual } from 'crypto';

/**
 * Authenticate admin requests via HTTP Basic Auth.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function authenticate(request: NextRequest): boolean {
  const authHeader = request.headers.get('authorization');
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return false;
  }

  try {
    const base64Credentials = authHeader.slice(6);
    const credentials = Buffer.from(base64Credentials, 'base64').toString('ascii');
    const [username, password] = credentials.split(':');

    const adminUsername = process.env.ADMIN_USERNAME;
    const adminPassword = process.env.ADMIN_PASSWORD;

    if (!adminUsername || !adminPassword) return false;

    const usernameMatch = safeCompare(username, adminUsername);
    const passwordMatch = safeCompare(password, adminPassword);

    return usernameMatch && passwordMatch;
  } catch (error) {
    console.error('Authentication error (lib/auth):', error);
    return false;
  }
}

/**
 * Validate preload requests using a shared secret.
 * The preload service must send the secret in the X-Preload-Secret header.
 * This replaces the previous header-spoofable localhost check.
 */
export function isPreloadRequest(request: NextRequest): boolean {
  const secret = process.env.PRELOAD_SECRET;
  if (!secret) return false;

  const providedSecret = request.headers.get('x-preload-secret');
  if (!providedSecret) return false;

  return safeCompare(providedSecret, secret);
}

/**
 * Constant-time string comparison to prevent timing attacks.
 */
function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) {
      // Compare against itself to maintain constant time
      timingSafeEqual(bufA, bufA);
      return false;
    }
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}
