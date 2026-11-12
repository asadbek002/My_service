'use client';
import { useEffect, useState } from 'react';

/**
 * The App Store app (Capacitor, see mobile/ios) adds "MyServiceApp-iOS" to its user agent. Apple lets an app
 * sell a subscription only through its own in-app purchase, so inside that app the plan chooser and any
 * talk of paying elsewhere are hidden; the subscription is managed on the website.
 */
export const IOS_APP_UA = 'MyServiceApp-iOS';
export function useIosApp() {
  const [ios, setIos] = useState(false);
  useEffect(() => { setIos(navigator.userAgent.includes(IOS_APP_UA)); }, []);
  return ios;
}
