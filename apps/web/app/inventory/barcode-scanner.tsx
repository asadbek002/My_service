'use client';
import { useEffect, useRef, useState } from 'react';

type Detector = { detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]> };
type DetectorConstructor = new (options?: { formats?: string[] }) => Detector;

export default function BarcodeScanner({ onScan }: { onScan: (value: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [error, setError] = useState('');

  function stop() {
    stream?.getTracks().forEach(track => track.stop());
    setStream(null);
  }

  async function start() {
    setError('');
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorClass) { setError('Bu brauzer kamera orqali barcode o‘qishni qo‘llamaydi.'); return; }
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false }));
    } catch {
      setError('Kameraga ruxsat berilmadi.');
    }
  }

  useEffect(() => {
    if (!stream || !video.current) return;
    const element = video.current;
    element.srcObject = stream;
    element.play().catch(() => setError('Kamerani ishga tushirib bo‘lmadi.'));
    const DetectorClass = (window as unknown as { BarcodeDetector?: DetectorConstructor }).BarcodeDetector;
    if (!DetectorClass) return;
    const detector = new DetectorClass({ formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code'] });
    let reading = false;
    const timer = window.setInterval(async () => {
      if (reading || element.readyState < 2) return;
      reading = true;
      try {
        const result = await detector.detect(element);
        if (result[0]?.rawValue) {
          onScan(result[0].rawValue);
          stream.getTracks().forEach(track => track.stop());
          setStream(null);
        }
      } catch { /* transient frame errors are retried */ }
      finally { reading = false; }
    }, 350);
    return () => { window.clearInterval(timer); stream.getTracks().forEach(track => track.stop()); };
  }, [stream, onScan]);

  return <div>
    {!stream ? <button type="button" className="secondary" onClick={start}>Kameradan scan</button> :
      <div><video ref={video} muted playsInline style={{ width: 'min(100%, 360px)', borderRadius: 12 }} /><button type="button" className="secondary" onClick={stop}>Yopish</button></div>}
    {error && <small className="error">{error}</small>}
  </div>;
}
