import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env.API_URL ?? 'http://localhost:4000';

export async function GET(request: NextRequest) {
  const tenantSlug = request.nextUrl.searchParams.get('tenantSlug');

  if (!tenantSlug) {
    return NextResponse.json({ connections: [], allowLocalAuth: true });
  }

  try {
    // Query the Fastify API for SSO connections
    // For now, return empty — will be populated when SSO connections are configured
    // In Phase 3, this will query the SsoConnection table via an API endpoint
    return NextResponse.json({
      connections: [],
      allowLocalAuth: true,
      enforceSso: false,
    });
  } catch {
    return NextResponse.json({ connections: [], allowLocalAuth: true });
  }
}
