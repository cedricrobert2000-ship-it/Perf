const dayFmt = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFmt = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });
const shortFmt = new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });

export const fmtDay = (iso) => dayFmt.format(new Date(iso));
export const fmtTime = (iso) => timeFmt.format(new Date(iso)).replace(':', 'h');
export const fmtShort = (iso) => shortFmt.format(new Date(iso));

export function dateChip(iso) {
  const d = new Date(iso);
  return {
    day: String(d.getDate()).padStart(2, '0'),
    month: d.toLocaleDateString('fr-FR', { month: 'short' }).replace('.', '').toUpperCase(),
    weekday: d.toLocaleDateString('fr-FR', { weekday: 'short' }).replace('.', '').toUpperCase(),
  };
}

export function relative(iso) {
  const diff = Date.parse(iso) - Date.now();
  const days = Math.round(diff / 86400000);
  const hours = Math.round(diff / 3600000);
  const rtf = new Intl.RelativeTimeFormat('fr', { numeric: 'auto' });
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  return rtf.format(days, 'day');
}

export const padBib = (n) => String(n).padStart(3, '0');

// "42:10", "1:02:33" or "3600" (seconds) → seconds
export function parseDuration(input) {
  const s = String(input || '').trim();
  if (!s) return null;
  const parts = s.split(/[:'h]/).filter(Boolean).map(Number);
  if (!parts.length || parts.some((p) => !Number.isFinite(p) || p < 0)) return NaN;
  return parts.reduce((acc, p) => acc * 60 + p, 0);
}

export function fmtDuration(total) {
  if (total == null) return '';
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0');
  const ss = String(s).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtPace(totalS, km) {
  if (!totalS || !km) return '';
  const per = Math.round(totalS / km);
  return `${Math.floor(per / 60)}'${String(per % 60).padStart(2, '0')}/km`;
}

export const fmtKm = (km) => (km == null ? '' : `${Number(km).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} km`);

// ISO → value for <input type="datetime-local"> in local time
export function toLocalInput(iso) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 16);
}
