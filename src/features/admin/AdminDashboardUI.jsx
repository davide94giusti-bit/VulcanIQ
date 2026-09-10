import React, { useEffect, useRef } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

export function AdminDashboardHeader({ eyebrow = 'vulcanIQ', title, description, actions }) {
  const titleNode = React.isValidElement(title) ? title : <h1>{title}</h1>;
  return (
    <header className="admin-dashboard-header">
      <div className="admin-dashboard-heading">
        <span className="admin-dashboard-eyebrow">{eyebrow}</span>
        {titleNode}
        {description && <p>{description}</p>}
      </div>
      {actions && <div className="admin-dashboard-actions">{actions}</div>}
    </header>
  );
}

export function AdminDashboardSection({ eyebrow, title, description, actions, children, className = '' }) {
  return (
    <section className={`admin-dashboard-section ${className}`.trim()}>
      {(eyebrow || title || description || actions) && (
        <header className="admin-dashboard-section-header">
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            {title && <h2>{title}</h2>}
            {description && <p>{description}</p>}
          </div>
          {actions && <div className="admin-dashboard-section-actions">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function AdminDashboardSkeleton({ label = 'Loading dashboard…', cards = 4 }) {
  return (
    <div className="admin-dashboard-skeleton" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      <div className="admin-dashboard-skeleton-grid" aria-hidden="true">
        {Array.from({ length: cards }, (_, index) => <i key={index} />)}
      </div>
    </div>
  );
}

export function AdminDashboardDrawer({ titleId, title, eyebrow, description, closeLabel = 'Close', onClose, children, wide = false }) {
  const drawerRef = useRef(null);
  const closeRef = useRef(null);

  useEffect(() => {
    const returnFocusTo = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closeRef.current?.focus();

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = [...(drawerRef.current?.querySelectorAll(FOCUSABLE) || [])];
      if (!focusable.length) {
        event.preventDefault();
        drawerRef.current?.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      returnFocusTo?.focus?.();
    };
  }, [onClose]);

  return (
    <div className="admin-dashboard-drawer-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose?.();
    }}>
      <aside
        ref={drawerRef}
        className={`admin-dashboard-drawer ${wide ? 'is-wide' : ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex="-1"
      >
        <header className="admin-dashboard-drawer-header">
          <div>
            {eyebrow && <span>{eyebrow}</span>}
            <h2 id={titleId}>{title}</h2>
            {description && <p>{description}</p>}
          </div>
          <button ref={closeRef} type="button" className="admin-dashboard-drawer-close" onClick={onClose} aria-label={closeLabel}>
            <span aria-hidden="true">×</span>
          </button>
        </header>
        <div className="admin-dashboard-drawer-body">{children}</div>
      </aside>
    </div>
  );
}
