import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'MeridianITSM Owner Admin',
  description: 'Owner Administration Portal',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
