export const metadata = {
  title: 'MeridianITSM Org Lookup',
  description: 'Tenant resolution service for MeridianITSM subdomain routing',
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
