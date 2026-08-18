import React, { useEffect, useRef, useState } from 'react';
import { REVIEW_FILTER_OPTIONS, reviewCopy, reviewFilterLabel } from './reviewModel.js';

export default function ReviewFilters({ lang = 'it', value = 'all', onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const copy = reviewCopy(lang);

  useEffect(() => {
    if (!open) return undefined;
    function close(event) {
      if (event?.key && event.key !== 'Escape') return;
      if (event?.target && ref.current?.contains(event.target)) return;
      setOpen(false);
    }
    document.addEventListener('pointerdown', close);
    window.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('pointerdown', close);
      window.removeEventListener('keydown', close);
    };
  }, [open]);

  return (
    <div className="review-filter-dropdown" ref={ref}>
      <button type="button" className="review-filter-trigger" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        {copy.filter}: {reviewFilterLabel(value, lang)} <span aria-hidden="true">▾</span>
      </button>
      {open && (
        <div className="review-filter-menu" role="menu">
          {REVIEW_FILTER_OPTIONS.map((option) => (
            <button
              key={option.key}
              type="button"
              role="menuitemradio"
              aria-checked={value === option.key}
              className={value === option.key ? 'is-active' : ''}
              onClick={() => { onChange?.(option.key); setOpen(false); }}
            >
              {reviewFilterLabel(option.key, lang)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
