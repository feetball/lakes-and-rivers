import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ message: 'Texas data endpoint not yet implemented' }, { status: 501 });
}
