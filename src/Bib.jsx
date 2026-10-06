import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { dateChip, fmtTime, padBib } from './format.js';
import { KINDS } from './covers.js';
import { absoluteUrl } from './router.js';

const PAPER = '#f3efe6';
const INK = '#111014';

export const checkinPath = (eventId, bib) => `/checkin/${eventId}/${bib}`;

function useQr(value) {
  const [src, setSrc] = useState(null);
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(value, { margin: 0, width: 320, color: { dark: INK, light: PAPER } })
      .then((url) => alive && setSrc(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [value]);
  return src;
}

// Paper race bib with safety-pin holes. Tilts towards the pointer.
export function Bib({ bib, member, event, compact = false }) {
  const ref = useRef(null);
  const qr = useQr(absoluteUrl(checkinPath(event.id, bib)));
  const chip = dateChip(event.startsAt);

  const onMove = (e) => {
    const el = ref.current;
    if (!el || compact) return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width - 0.5;
    const y = (e.clientY - r.top) / r.height - 0.5;
    el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
    el.style.setProperty('--ry', `${(x * 12).toFixed(2)}deg`);
    el.style.setProperty('--gx', `${(x + 0.5) * 100}%`);
    el.style.setProperty('--gy', `${(y + 0.5) * 100}%`);
  };
  const onLeave = () => {
    ref.current?.style.setProperty('--rx', '0deg');
    ref.current?.style.setProperty('--ry', '0deg');
  };

  return (
    <div
      ref={ref}
      className={`bib${compact ? ' compact' : ''}`}
      style={{ '--c': member.color }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
    >
      <span className="hole tl" />
      <span className="hole tr" />
      <span className="hole bl" />
      <span className="hole br" />
      <div className="bib-band">
        <span className="bib-logo">PERF</span>
        <span className="bib-meta">
          {chip.weekday} {chip.day} {chip.month} · {fmtTime(event.startsAt)}
        </span>
      </div>
      <div className="bib-number">{padBib(bib)}</div>
      <div className="bib-name">{member.name}</div>
      <div className="bib-foot">
        <div className="bib-event">
          <span className="bib-kind">{KINDS[event.kind] || 'Run'}</span>
          <strong>{event.title}</strong>
        </div>
        {qr && <img className="bib-qr" src={qr} alt={`QR check-in dossard ${bib}`} />}
      </div>
      <div className="bib-sheen" />
    </div>
  );
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function fitText(ctx, text, font, size, maxWidth) {
  let s = size;
  ctx.font = `${font.replace('{s}', s)}`;
  while (ctx.measureText(text).width > maxWidth && s > 10) {
    s -= 4;
    ctx.font = `${font.replace('{s}', s)}`;
  }
  return s;
}

// Renders the bib on a canvas (fonts included) and downloads it as a PNG.
export async function downloadBib({ bib, member, event }) {
  await Promise.all([
    document.fonts.load('900 200px Unbounded'),
    document.fonts.load('700 40px Unbounded'),
    document.fonts.load('600 40px Inter'),
    document.fonts.load('700 40px Inter'),
  ]).catch(() => {});

  const W = 1500;
  const H = 1060;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 44);
  ctx.fillStyle = PAPER;
  ctx.fill();
  ctx.save();
  ctx.clip();

  const band = ctx.createLinearGradient(0, 0, W, 0);
  band.addColorStop(0, member.color);
  band.addColorStop(1, INK);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 190);

  // Paper grain
  const noise = ctx.getImageData(0, 0, W, H);
  for (let i = 0; i < noise.data.length; i += 4) {
    const n = (Math.random() - 0.5) * 22;
    noise.data[i] += n;
    noise.data[i + 1] += n;
    noise.data[i + 2] += n;
  }
  ctx.putImageData(noise, 0, 0);

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'alphabetic';
  ctx.font = '900 76px Unbounded';
  ctx.fillText('PERF', 150, 125);
  const chip = dateChip(event.startsAt);
  ctx.font = '600 38px Inter';
  ctx.textAlign = 'right';
  ctx.fillText(`${chip.weekday} ${chip.day} ${chip.month} · ${fmtTime(event.startsAt)}`, W - 150, 118);

  ctx.textAlign = 'center';
  ctx.fillStyle = INK;
  const number = padBib(bib);
  fitText(ctx, number, '900 {s}px Unbounded', 440, W - 260);
  ctx.fillText(number, W / 2, 640);

  ctx.font = '700 64px Inter';
  ctx.letterSpacing = '10px';
  fitText(ctx, member.name.toUpperCase(), '700 {s}px Inter', 64, W - 600);
  ctx.fillText(member.name.toUpperCase(), W / 2, 760);
  ctx.letterSpacing = '0px';

  ctx.fillStyle = 'rgba(17,16,20,.12)';
  ctx.fillRect(110, 820, W - 220, 3);

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(17,16,20,.55)';
  ctx.font = '700 30px Inter';
  ctx.fillText((KINDS[event.kind] || 'Run').toUpperCase(), 110, 890);
  ctx.fillStyle = INK;
  fitText(ctx, event.title, '700 {s}px Unbounded', 54, W - 560);
  ctx.fillText(event.title, 110, 960);

  const qrUrl = await QRCode.toDataURL(absoluteUrl(checkinPath(event.id, bib)), {
    margin: 0,
    width: 360,
    color: { dark: INK, light: PAPER },
  });
  ctx.drawImage(await loadImage(qrUrl), W - 110 - 180, 845, 180, 180);
  ctx.restore();

  // Safety-pin holes
  for (const [x, y] of [[62, 62], [W - 62, 62], [62, H - 62], [W - 62, H - 62]]) {
    ctx.beginPath();
    ctx.arc(x, y, 20, 0, Math.PI * 2);
    ctx.fillStyle = '#0c0b10';
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = 'rgba(255,255,255,.55)';
    ctx.stroke();
  }

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `perf-dossard-${number}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
