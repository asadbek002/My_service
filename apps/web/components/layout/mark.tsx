/** The brand mark: the app icon, or the service's own logo. Reads on paper and on the mat sidebar. */
export function Mark({ size = 'md', src }: { size?: 'md' | 'lg'; src?: string | null | undefined }) {
  // The service's own logo, when uploaded in Settings.
  if (src) {
    return <img src={src} alt="" className={(size === 'lg' ? 'h-11 w-auto max-w-[10rem] rounded-lg' : 'h-8 w-auto max-w-[8rem] rounded-md') + ' shrink-0 bg-white object-contain'} />;
  }
  // The app icon (a phone with a blue gear, from the MyServiceUz logo), the same one as on the home screen.
  // eslint-disable-next-line @next/next/no-img-element
  return <img src="/icon.svg" alt="" className={(size === 'lg' ? 'h-11 w-11 rounded-xl' : 'h-8 w-8 rounded-lg') + ' shrink-0'} />;
}
