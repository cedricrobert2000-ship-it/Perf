import { useEffect, useState } from 'react';

const read = () => window.location.hash.replace(/^#/, '') || '/';

export function useRoute() {
  const [path, setPath] = useState(read);
  useEffect(() => {
    const onChange = () => {
      setPath(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);
  return path;
}

export const navigate = (to) => {
  window.location.hash = to;
};

export const linkTo = (to) => `#${to}`;

export const absoluteUrl = (to) => `${window.location.origin}${window.location.pathname}#${to}`;
