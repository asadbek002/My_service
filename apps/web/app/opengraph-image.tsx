import { ImageResponse } from 'next/og';

// The picture shown when the site is shared in Telegram, Facebook and the like.
export const alt = "MyService — ta'mirlash ustaxonasi uchun dastur";
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', padding: 72, background: '#0C1615', color: 'white', fontFamily: 'sans-serif' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#FF6A2B', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30, fontWeight: 700, color: '#0C1615' }}>MS</div>
          <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: 6 }}>MY SERVICE</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.05 }}>Ta&apos;mirlash ustaxonasi uchun dastur</div>
          <div style={{ fontSize: 32, color: 'rgba(255,255,255,0.75)' }}>Qabul va chek · SMS va Telegram xabar · To&apos;lov va qarz · Hisobot</div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 28, color: 'rgba(255,255,255,0.6)' }}>
          <span>myserviceuz.uz</span><span style={{ color: '#FF6A2B' }}>1 oy bepul</span>
        </div>
      </div>
    ),
    size,
  );
}
