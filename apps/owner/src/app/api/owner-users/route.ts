import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../lib/owner-auth';
import { NextResponse } from 'next/server';
import { hashSync } from '@node-rs/bcrypt';

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

export async function GET(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const users = await prisma.ownerUser.findMany({
    select: {
      id: true,
      email: true,
      totpEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json({ users });
}

export async function POST(request: Request) {
  const payload = await authenticate(request);
  if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { email?: string; password?: string };
  try {
    body = await request.json() as { email?: string; password?: string };
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { email, password } = body;
  if (!email || !password) {
    return NextResponse.json({ error: 'email and password are required' }, { status: 400 });
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 });
  }

  const existing = await prisma.ownerUser.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: 'An owner user with that email already exists' }, { status: 409 });
  }

  const passwordHash = hashSync(password, 12);

  const user = await prisma.ownerUser.create({
    data: { email, passwordHash },
    select: {
      id: true,
      email: true,
      totpEnabled: true,
      lastLoginAt: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user }, { status: 201 });
}
