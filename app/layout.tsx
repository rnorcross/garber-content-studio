import '@fontsource-variable/archivo';
import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Garber Content Studio',
  description: 'Create, edit and manage the HTML content embedded on Garber dealership websites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
