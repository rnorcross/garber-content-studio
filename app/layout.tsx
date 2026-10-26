import './globals.css';
import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Garber Content Studio',
  description: 'Create, edit and manage the HTML content embedded on Garber dealership websites.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Work+Sans:wght@400;500;600;700;800;900&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
