import { NextRequest, NextResponse } from 'next/server';

// ---------------------------------------------------------------------------
// Rate Limiter (in-memory, per-instance)
// ---------------------------------------------------------------------------
interface RateLimitEntry {
  count: number;
  resetTime: number;
}

const rateLimitMap = new Map<string, RateLimitEntry>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const PUBLIC_RATE_LIMIT = 60;        // requests per window
const ADMIN_RATE_LIMIT = 10;         // requests per window

// Clean up stale entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitMap) {
    if (now > entry.resetTime) {
      rateLimitMap.delete(key);
    }
  }
}, 5 * 60_000);

function isRateLimited(ip: string, limit: number): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }

  entry.count++;
  return entry.count > limit;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------
function getAllowedOrigins(): string[] {
  const envOrigins = process.env.CORS_ORIGINS;
  if (envOrigins) {
    return envOrigins.split(',').map((o) => o.trim()).filter(Boolean);
  }
  // Default: allow same-origin only (no extra origins)
  return [];
}

function isOriginAllowed(origin: string | null): boolean {
  if (!origin) return true; // same-origin requests have no Origin header
  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return true; // if not configured, allow all (backwards-compatible until env is set)
  return allowed.some((ao) => {
    if (ao === '*') return true;
    return origin === ao;
  });
}

// ---------------------------------------------------------------------------
// Security Headers
// ---------------------------------------------------------------------------
const securityHeaders: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), camera=(), microphone=()',
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'Content-Security-Policy': [
    "default-src 'self'",
    // Scripts: self + inline needed for Next.js hydration
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    // Styles: self + inline for Tailwind / Leaflet
    "style-src 'self' 'unsafe-inline'",
    // Images: self + OpenStreetMap tiles + data URIs for Leaflet markers
    "img-src 'self' data: blob: https://*.tile.openstreetmap.org https://unpkg.com",
    // Fonts
    "font-src 'self'",
    // API connections: self + USGS + Overpass + NWS
    "connect-src 'self' https://waterservices.usgs.gov https://overpass-api.de https://water.weather.gov https://nwis.waterservices.usgs.gov",
    // Leaflet icons from CDN
    "worker-src 'self' blob:",
  ].join('; '),
};

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isApiRoute = pathname.startsWith('/api/');
  const isAdminRoute = pathname.startsWith('/api/admin/');
  const origin = request.headers.get('origin');

  // --- Preflight (OPTIONS) ---
  if (request.method === 'OPTIONS' && isApiRoute) {
    const response = new NextResponse(null, { status: 204 });
    if (isOriginAllowed(origin) && origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      response.headers.set('Access-Control-Max-Age', '86400');
    }
    // Add security headers to preflight too
    for (const [key, value] of Object.entries(securityHeaders)) {
      response.headers.set(key, value);
    }
    return response;
  }

  // --- Rate limiting ---
  if (isApiRoute) {
    const forwarded = request.headers.get('x-forwarded-for');
    const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || 'unknown';
    const limit = isAdminRoute ? ADMIN_RATE_LIMIT : PUBLIC_RATE_LIMIT;

    if (isRateLimited(ip, limit)) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        {
          status: 429,
          headers: {
            'Retry-After': '60',
            ...securityHeaders,
          },
        }
      );
    }
  }

  // --- Continue to the route handler, then add headers to the response ---
  const response = NextResponse.next();

  // Security headers on all responses
  for (const [key, value] of Object.entries(securityHeaders)) {
    response.headers.set(key, value);
  }

  // CORS headers on API responses
  if (isApiRoute && origin && isOriginAllowed(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  }

  return response;
}

export const config = {
  matcher: [
    // Match all routes except static files and Next.js internals
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};
