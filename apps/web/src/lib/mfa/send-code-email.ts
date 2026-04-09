import nodemailer from 'nodemailer';

/**
 * Send an MFA verification code via email.
 * Uses SMTP configuration from environment variables.
 *
 * Falls back gracefully to console.log if SMTP is not configured,
 * so development environments still work.
 */
export async function sendMfaCodeEmail(
  to: string,
  code: string,
): Promise<void> {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? '587');
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? 'noreply@meridianitsm.com';

  if (!host) {
    // SMTP not configured — log to console for dev environments
    console.log(`[MFA] Email verification code for ${to}: ${code}`);
    return;
  }

  const transport = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: user && pass ? { user, pass } : undefined,
  });

  try {
    await transport.sendMail({
      from,
      to,
      subject: 'Your MeridianITSM verification code',
      html: `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 24px;">
          <h2 style="color: #1e293b; margin: 0 0 16px;">Verification Code</h2>
          <p style="color: #64748b; font-size: 15px; margin: 0 0 20px;">
            Use the following code to verify your identity. This code expires in 5 minutes.
          </p>
          <div style="background: #f1f5f9; border-radius: 8px; padding: 20px; text-align: center; margin: 0 0 20px;">
            <span style="font-size: 32px; font-weight: 700; letter-spacing: 6px; color: #0f172a;">${code}</span>
          </div>
          <p style="color: #94a3b8; font-size: 13px; margin: 0;">
            If you didn't request this code, you can safely ignore this email.
          </p>
        </div>
      `,
    });
  } finally {
    transport.close();
  }
}
