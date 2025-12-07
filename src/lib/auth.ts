import { NextRequest } from 'next/server';

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

    if (!adminPassword) return false;

    return username === adminUsername && password === adminPassword;
  } catch (error) {
    console.error('Authentication error (lib/auth):', error);
    return false;
  }
}

export function isPreloadRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  const host = request.headers.get('host') || '';
  const xForwardedFor = request.headers.get('x-forwarded-for') || '';

  const isLocalOrInternal = host.includes('localhost') ||
    host.includes('127.0.0.1') ||
    host.includes('app:') ||
    xForwardedFor.includes('172.') ||
    xForwardedFor.includes('192.168.') ||
    xForwardedFor.includes('10.');

  return isLocalOrInternal && userAgent.includes('node');
}

export function isFormBasedRequest(request: NextRequest): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  const referer = request.headers.get('referer') || '';
  const origin = request.headers.get('origin') || '';

  return userAgent.includes('Mozilla') && (
    referer.includes('/admin/') ||
    origin.includes('localhost') ||
    referer.includes('admin')
  );
}
