import { prisma } from '@meridian/db';
import { verifyOwnerToken } from '../../../../lib/owner-auth';
import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';

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

export async function POST(request: Request) {
  if (!(await authenticate(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json() as { to?: string };
  const { to } = body;

  if (!to || typeof to !== 'string' || !to.trim()) {
    return NextResponse.json({ error: 'to email address is required' }, { status: 400 });
  }

  const config = await prisma.ownerSmtpConfig.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!config) {
    return NextResponse.json({ error: 'No SMTP configuration found. Please save a configuration first.' }, { status: 400 });
  }

  try {
    const transport = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      ...(config.username ? { auth: { user: config.username, pass: config.password ?? '' } } : {}),
      tls: { rejectUnauthorized: false },
    });

    await transport.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to: to.trim(),
      subject: 'MeridianITSM — SMTP Test',
      text: 'This is a test email from MeridianITSM Owner Admin. If you received this, your SMTP configuration is working correctly.',
      html: '<h2>MeridianITSM SMTP Test</h2><p>This is a test email from MeridianITSM Owner Admin.</p><p>If you received this, your SMTP configuration is working correctly.</p>',
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to send test email';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
