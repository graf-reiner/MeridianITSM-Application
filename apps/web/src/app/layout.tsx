import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import './globals.css';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'MeridianITSM',
  description: 'IT Service Management Platform',
  icons: { icon: '/images/meridian-logo.svg' },
};

// Static string literal — reads theme cookie before first paint to prevent flash
const THEME_SCRIPT = `(function(){try{var p=document.cookie.match(/(?:^|; )meridian-theme-pref=([^;]*)/);var t=p?p[1]:"system";var r;if(t==="system"){r=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}else{r=t}document.documentElement.setAttribute("data-theme",r)}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const resolvedTheme = cookieStore.get('meridian-theme')?.value || 'light';

  return (
    <html lang="en" data-theme={resolvedTheme} suppressHydrationWarning>
      <head>
        {/* Safe: THEME_SCRIPT is a compile-time constant with no user input */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
