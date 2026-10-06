const unsplash = (id) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=1400&q=70`;

// Each preset has a gradient that shows while the photo loads (or if it can't).
export const COVERS = [
  { key: 'road', label: 'Bitume', url: unsplash('1552674605-db6ffd4facb5'), gradient: 'linear-gradient(135deg,#ff5a1f,#6b4dff)' },
  { key: 'sunset', label: 'Golden hour', url: unsplash('1476480862126-209bfaa8edc8'), gradient: 'linear-gradient(135deg,#ffb33f,#ff2d87)' },
  { key: 'track', label: 'Piste', url: unsplash('1461896836934-ffe607ba8211'), gradient: 'linear-gradient(135deg,#ff2d87,#2b1a6b)' },
  { key: 'stride', label: 'Foulée', url: unsplash('1571008887538-b36bb32f4571'), gradient: 'linear-gradient(135deg,#6b4dff,#00c2ff)' },
  { key: 'city', label: 'City', url: unsplash('1483721310020-03333e577078'), gradient: 'linear-gradient(135deg,#1d1d2b,#ff5a1f)' },
  { key: 'trail', label: 'Trail', url: unsplash('1502904550040-7534597429ae'), gradient: 'linear-gradient(135deg,#1f7a4d,#c6ff3d)' },
  { key: 'ride', label: 'Vélo', url: unsplash('1517649763962-0c623066013b'), gradient: 'linear-gradient(135deg,#00c2ff,#ff2d87)' },
  { key: 'crew', label: 'Crew', url: unsplash('1530143311094-34d807799e8f'), gradient: 'linear-gradient(135deg,#c6ff3d,#6b4dff)' },
];

const GRADIENTS = COVERS.map((c) => c.gradient);

export function resolveCover(cover, seed = 0) {
  if (cover?.startsWith('preset:')) {
    const preset = COVERS.find((c) => c.key === cover.slice(7));
    if (preset) return { src: preset.url, gradient: preset.gradient };
  }
  return { src: cover || null, gradient: GRADIENTS[Math.abs(Number(seed) || 0) % GRADIENTS.length] };
}

export const KINDS = {
  run: 'Run',
  long: 'Sortie longue',
  track: 'Fractionné',
  trail: 'Trail',
  ride: 'Vélo',
  social: 'Social run',
};

export const MEMBER_COLORS = ['#ff5a1f', '#ff2d87', '#6b4dff', '#00c2ff', '#c6ff3d', '#ffb33f', '#19d3a2', '#f4f1ea'];

// Shrinks a picked image to a reasonable JPEG data URL before upload.
export function compressImage(file, maxSize = 1200) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSize / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Image illisible.'));
    };
    img.src = url;
  });
}
