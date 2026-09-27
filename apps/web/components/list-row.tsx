import Link from 'next/link';
import type { ReactNode } from 'react';

/** Two-line list row with a right-aligned figure; a link when `href` is given. */
export function ListRow({ href, title, sub, right, rightSub }: { href?: string; title: ReactNode; sub?: ReactNode; right?: ReactNode; rightSub?: ReactNode }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        {sub && <p className="truncate text-xs text-mute">{sub}</p>}
      </div>
      {(right || rightSub) && (
        <div className="shrink-0 text-right">
          {right && <p className="num font-mono text-sm font-semibold">{right}</p>}
          {rightSub && <p className="text-xs text-mute">{rightSub}</p>}
        </div>
      )}
    </>
  );
  return <li>{href ? <Link href={href} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">{body}</Link> : <div className="flex items-center gap-3 px-4 py-3">{body}</div>}</li>;
}
export function List({ children }: { children: ReactNode }) {
  return <ul className="divide-y overflow-hidden rounded-lg border bg-white">{children}</ul>;
}
