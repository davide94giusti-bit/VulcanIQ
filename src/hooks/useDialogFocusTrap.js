import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function useDialogFocusTrap(open, panelRef, onClose) {
  const openerRef = useRef(null);

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    const first = panel?.querySelector(FOCUSABLE);
    (first instanceof HTMLElement ? first : panel)?.focus?.();

    function keydown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose?.();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = [...panel.querySelectorAll(FOCUSABLE)]
        .filter((element) => element instanceof HTMLElement && !element.hasAttribute('disabled'));
      if (!focusable.length) {
        event.preventDefault();
        panel.focus?.();
        return;
      }
      const firstItem = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    window.addEventListener('keydown', keydown);
    return () => {
      window.removeEventListener('keydown', keydown);
      window.setTimeout(() => openerRef.current?.focus?.(), 0);
    };
  }, [open, panelRef, onClose]);
}
