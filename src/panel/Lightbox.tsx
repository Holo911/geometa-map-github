import { useEffect } from 'react';
import type { EntryImage } from '../lib/types';
import { useT } from '../i18n';

interface LightboxProps {
  images: EntryImage[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}

export default function Lightbox({ images, index, onIndex, onClose }: LightboxProps) {
  const t = useT();
  const img = images[index];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') onIndex((index + 1) % images.length);
      else if (e.key === 'ArrowLeft') onIndex((index - 1 + images.length) % images.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, images.length, onIndex, onClose]);

  if (!img) return null;

  return (
    <div className="lightbox" onClick={onClose}>
      <span className="lightbox-counter">
        {index + 1} / {images.length}
      </span>
      <button className="lightbox-close" onClick={onClose} aria-label={t('common.close')}>
        ✕
      </button>

      {images.length > 1 && (
        <button
          className="lightbox-nav prev"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index - 1 + images.length) % images.length);
          }}
          aria-label={t('common.previous')}
        >
          ‹
        </button>
      )}

      <img src={img.url} alt={img.caption || ''} onClick={(e) => e.stopPropagation()} />
      {img.caption && <div className="lightbox-caption">{img.caption}</div>}

      {images.length > 1 && (
        <button
          className="lightbox-nav next"
          onClick={(e) => {
            e.stopPropagation();
            onIndex((index + 1) % images.length);
          }}
          aria-label={t('common.next')}
        >
          ›
        </button>
      )}
    </div>
  );
}
