import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { NextResponse } from 'next/server';

async function authenticate(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const payload = await verifyOwnerToken(authHeader.slice(7));
    if (payload.type !== 'access') return null;
    return payload;
  } catch {
    return null;
  }
}

function maskConfig(config: {
  id: string;
  host: string;
  port: number;
  secure: boolean;
  username: string | null;
  password: string | null;
  fromEmail: string;
  fromName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    ...config,
    password: config.password ? '********' : '',
  };
}

export async function GET(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const config = await prisma.ownerSmtpConfig.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!config) {
    return NextResponse.json({ config: null });
  }

  return NextResponse.json({ config: maskConfig(config) });
}

export async function POST(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as {
    host?: string;
    port?: number;
    secure?: boolean;
    username?: string;
    password?: string;
    fromEmail?: string;
    fromName?: string;
  };

  const { host, port, secure, username, password, fromEmail, fromName } = body;

  if (!host || typeof host !== 'string' || !host.trim()) {
    return NextResponse.json({ error: 'host is required' }, { status: 400 });
  }
  if (!fromEmail || typeof fromEmail !== 'string' || !fromEmail.trim()) {
    return NextResponse.json({ error: 'fromEmail is required' }, { status: 400 });
  }

  // Check if a config already exists
  const existing = await prisma.ownerSmtpConfig.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  const updateData: {
    host: string;
    port: number;
    secure: boolean;
    username: string | null;
    fromEmail: string;
    fromName: string;
    password?: string;
  } = {
    host: host.trim(),
    port: typeof port === 'number' ? port : 25,
    secure: typeof secure === 'boolean' ? secure : false,
    username: username?.trim() || null,
    fromEmail: fromEmail.trim(),
    fromName: (fromName?.trim()) || 'MeridianITSM',
  };

  // Only update password if not the masked sentinel value
  if (password !== '********') {
    (updateData as Record<string, unknown>).password = password?.trim() || null;
  }

  let saved;
  if (existing) {
    saved = await prisma.ownerSmtpConfig.update({
      where: { id: existing.id },
      data: updateData,
    });
  } else {
    saved = await prisma.ownerSmtpConfig.create({
      data: updateData,
    });
  }

  return NextResponse.json({ config: maskConfig(saved) });
}
