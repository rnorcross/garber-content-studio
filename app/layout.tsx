import '@fontsource-variable/archivo';
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Garber Website Studio',
  description: 'Edit and manage Garber dealership website content and body shop websites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
