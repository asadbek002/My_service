const fs = require('fs');
const sharp = require('sharp') // run: cd store && node make-icons.cjs (needs sharp);
// Gear: 8 teeth around (cx, cy)
function gear(cx, cy, rOut, rIn, teeth, hole) {
  const pts = [], step = Math.PI * 2 / teeth, base = step * 0.56, top = step * 0.36;
  const p = (a, r) => `${(cx + r * Math.cos(a)).toFixed(1)},${(cy + r * Math.sin(a)).toFixed(1)}`;
  for (let k = 0; k < teeth; k++) {
    const c = k * step - Math.PI / 2;
    pts.push(p(c - base / 2, rIn), p(c - top / 2, rOut), p(c + top / 2, rOut), p(c + base / 2, rIn));
  }
  return `<path fill-rule="evenodd" fill="url(#g)" d="M${pts.join('L')}Z M${cx + hole},${cy} a${hole},${hole} 0 1,0 ${-2 * hole},0 a${hole},${hole} 0 1,0 ${2 * hole},0Z"/>`;
}
const defs = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1D4ED8"/><stop offset="1" stop-color="#22A6F2"/></linearGradient></defs>`;
// Phone (black frame like the logo, blue screen edge) with the blue gear on its screen.
const mark = `
  <rect x="160" y="84" width="192" height="344" rx="38" fill="#111113"/>
  <rect x="174" y="136" width="164" height="236" rx="4" fill="#fff"/>
  <rect x="180" y="142" width="152" height="224" rx="2" fill="none" stroke="url(#g)" stroke-width="8"/>
  <rect x="226" y="106" width="60" height="10" rx="5" fill="#fff"/>
  <circle cx="256" cy="400" r="12" fill="#fff"/>
  ${gear(256, 254, 70, 54, 8, 24)}`;
const square = bg => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${defs}<rect width="512" height="512" ${bg}/>${mark}</svg>`;
const rounded = square('rx="112" fill="#fff"');
const full = square('fill="#fff"');
fs.writeFileSync('icon.svg', rounded);
fs.writeFileSync('icon-full.svg', full);
(async () => {
  const out = [['icon-192.png', rounded, 192], ['icon-512.png', rounded, 512], ['icon-maskable-512.png', full, 512], ['apple-touch-icon.png', full, 180], ['app-store-1024.png', full, 1024], ['play-store-512.png', full, 512]];
  for (const [f, svg, s] of out) {
    let img = sharp(Buffer.from(svg), { density: 72 * s / 512 * 4 }).resize(s, s);
    if (f !== 'icon-192.png' && f !== 'icon-512.png') img = img.flatten({ background: '#ffffff' }).removeAlpha();
    await img.png().toFile(f);
  }
  // iOS app: icon and launch screen (the mark small in the middle of white; the screen crops the edges).
  const ios = '../mobile/ios/ios/App/App/Assets.xcassets/';
  fs.copyFileSync('app-store-1024.png', ios + 'AppIcon.appiconset/AppIcon-512@2x.png');
  const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732">${defs}<rect width="2732" height="2732" fill="#fff"/><g transform="translate(1016 1016) scale(1.367)">${mark}</g></svg>`;
  for (const f of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png'])
    await sharp(Buffer.from(splash)).resize(2732, 2732).flatten({ background: '#ffffff' }).removeAlpha().png().toFile(ios + 'Splash.imageset/' + f);
  console.log('ok');
})();
