/** The brand mark: a repair tag (orange, punched hole, "MS"). Reads on paper and on the mat sidebar. */
export function Mark({ size = 'md', src }: { size?: 'md' | 'lg'; src?: string | null | undefined }) {
  // The service's own logo, when uploaded in Settings.
  if (src) {
    return <img src={src} alt="" className={(size === 'lg' ? 'h-11 w-auto max-w-[10rem] rounded-lg' : 'h-8 w-auto max-w-[8rem] rounded-md') + ' shrink-0 bg-white object-contain'} />;
  }
  const lg = size === 'lg';
  return (
    <span className={`relative flex shrink-0 items-center justify-end bg-brand font-mono font-semibold text-ink ${lg ? 'h-11 w-14 rounded-l-lg rounded-r-xl pr-2 text-sm' : 'h-8 w-10 rounded-l-md rounded-r-lg pr-1.5 text-[11px]'}`}>
      <span aria-hidden="true" className={`absolute rounded-full bg-paper ${lg ? 'left-2 h-3 w-3' : 'left-1.5 h-2 w-2'}`} />
      MS
    </span>
  );
}
