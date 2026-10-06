import { createContext, useCallback, useContext, useEffect, useState } from 'react';

export function Avatar({ name = '?', color = '#ff5a1f', size = 36, ring = false }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <span
      className={`avatar${ring ? ' ring' : ''}`}
      style={{ '--c': color, width: size, height: size, fontSize: size * 0.38 }}
      title={name}
    >
      {initials}
    </span>
  );
}

export function AvatarStack({ people = [], total = people.length, size = 30 }) {
  const extra = total - people.length;
  return (
    <span className="avatar-stack">
      {people.map((p) => (
        <Avatar key={p.id} name={p.name} color={p.color} size={size} ring />
      ))}
      {extra > 0 && (
        <span className="avatar ring more" style={{ width: size, height: size, fontSize: size * 0.34 }}>
          +{extra}
        </span>
      )}
    </span>
  );
}

// Blurred editorial photo with gradient fallback, shade and grain.
export function Photo({ src, gradient, blur = 'md', className = '', children }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  return (
    <div className={`photo blur-${blur} ${className}`} style={{ backgroundImage: gradient }}>
      {src && !failed && <img src={src} alt="" loading="lazy" onError={() => setFailed(true)} />}
      <div className="photo-shade" />
      <div className="grain-local" />
      {children}
    </div>
  );
}

export function Modal({ open, onClose, children, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    document.body.classList.add('no-scroll');
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.classList.remove('no-scroll');
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal glass${wide ? ' wide' : ''}`} onClick={(e) => e.stopPropagation()} role="dialog">
        {onClose && (
          <button className="modal-close" onClick={onClose} aria-label="Fermer">
            ×
          </button>
        )}
        {children}
      </div>
    </div>
  );
}

export const Spinner = () => <div className="spinner" aria-label="Chargement" />;

export function Empty({ title, children }) {
  return (
    <div className="empty glass">
      <p className="empty-title">{title}</p>
      {children}
    </div>
  );
}

const ToastContext = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const push = useCallback((message, tone = 'ok') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.tone}`}>
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);
