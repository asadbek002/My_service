import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// The platform console is for its owner only: never in search results, even when a link leaks.
export const metadata: Metadata = { title: 'Platforma', robots: { index: false, follow: false } };

export default function PlatformLayout({ children }: { children: ReactNode }) {
  return children;
}
