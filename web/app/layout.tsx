import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono, Space_Grotesk } from 'next/font/google';
import { SessionBoot } from '@/components/auth/SessionBoot';
import { ConnectionStatus } from '@/components/system/ConnectionStatus';
import { Toaster } from '@/components/ui/Toaster';
import './globals.css';

/*
 * Three families, each with a job: Space Grotesk for display (technical without
 * being a stencil), Inter for interface text, JetBrains Mono for room codes and
 * timers, where character-by-character legibility and fixed width matter.
 *
 * `display: swap` renders fallback text immediately rather than blocking on the
 * font - the splash screen should never be a blank rectangle on a slow phone.
 */
const spaceGrotesk = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '700'],
  variable: '--font-space-grotesk',
  display: 'swap',
});

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['500'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'VOIDLINE',
    template: '%s · VOIDLINE',
  },
  description:
    'A real-time multiplayer social deduction game aboard ORBITAL-09. Keep the station alive, or bring it down from the inside.',
  applicationName: 'VOIDLINE',
  openGraph: {
    title: 'VOIDLINE',
    description: 'Keep the station alive, or bring it down from the inside.',
    siteName: 'VOIDLINE',
    type: 'website',
  },
  formatDetection: {
    // Room codes are alphanumeric; iOS otherwise links some of them as phone
    // numbers, which turns a code into a tappable dialer prompt.
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  /*
   * Zoom is deliberately NOT disabled. Locking `maximumScale` is the usual
   * reflex for a game, but it breaks WCAG 1.4.4 for anyone who needs to
   * magnify text (§46). Accidental zoom during play is prevented where it
   * actually matters - on the game surface - with `touch-action: none`, rather
   * than by taking magnification away from the whole application.
   */
  viewportFit: 'cover',
  themeColor: '#05070C',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable}`}
    >
      <body className="station-backdrop min-h-screen-safe antialiased">
        {/* Keyboard users land here first and can jump the chrome (§46). */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-100 focus:rounded-lg focus:bg-signal focus:px-4 focus:py-2 focus:font-medium focus:text-void-950"
        >
          Skip to content
        </a>
        <SessionBoot />
        {children}
        <ConnectionStatus />
        <Toaster />
      </body>
    </html>
  );
}
