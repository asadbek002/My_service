import { AuthFrame } from '../../components/layout/auth-frame';

export default function Offline() {
  return (
    <AuthFrame eyebrow="Aloqa yo'q" title="Internet uzildi">
      <p className="text-sm text-mute">Ulanish tiklangach sahifani yangilang. Internetsiz kiritilgan o&apos;zgarishlar saqlanmaydi.</p>
    </AuthFrame>
  );
}
