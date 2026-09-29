/** The brand tile: ink letters on the signal orange. Reads on paper and on the ink sidebar. */
export function Mark({ size = 'md' }: { size?: 'md' | 'lg' }) {
  return (
    <span className={size === 'lg'
      ? 'flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-brand font-mono text-sm font-bold text-ink'
      : 'flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-brand font-mono text-[11px] font-bold text-ink'}>MS</span>
  );
}
