import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json({ message: 'Gauge refresh not yet implemented' }, { status: 501 });
}
