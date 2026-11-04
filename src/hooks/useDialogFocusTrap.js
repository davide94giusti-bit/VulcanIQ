import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';
const dialogStack = [];

export default function useDialogFocusTrap(open, panelRef, onClose) {
  const openerRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open || typeof document === 'undefined') return undefined;
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const panel = panelRef.current;
    if (!panel) return undefined;
    const token = {};
    dialogStack.push(token);
    const inactive = [];
    let ancestor = panel;
    while (ancestor.parentElement) {
      for (const sibling of ancestor.parentElement.children) {
        if (sibling !== ancestor && !sibling.inert) { inactive.push(sibling); sibling.inert = true; }
      }
      ancestor = ancestor.parentElement;
      if (ancestor === document.body) break;
    }
    const first = [...panel.querySelectorAll(FOCUSABLE)].find(element => !element.closest('[inert]') && element.getClientRects().length > 0);
    (first instanceof HTMLElement ? first : panel)?.focus?.();

    function keydown(event) {
      if (dialogStack.at(-1) !== token) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current?.();
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const focusable = [...panel.querySelectorAll(FOCUSABLE)]
        .filter((element) => element instanceof HTMLElement && !element.hasAttribute('disabled') && !element.closest('[inert]') && element.getClientRects().length > 0);
      if (!focusable.length) {
        event.preventDefault();
        panel.focus?.();
        return;
      }
      const firstItem = focusable[0];
      const lastItem = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === firstItem || !panel.contains(document.activeElement))) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && (document.activeElement === lastItem || !panel.contains(document.activeElement))) {
        event.preventDefault();
        firstItem.focus();
      }
    }

    window.addEventListener('keydown', keydown, true);
    return () => {
      window.removeEventListener('keydown', keydown, true);
      const index = dialogStack.indexOf(token);
      if (index !== -1) dialogStack.splice(index, 1);
      inactive.forEach((element) => { element.inert = false; });
      const opener = openerRef.current;
      window.setTimeout(() => { if (opener?.isConnected && !opener.closest('[inert]')) opener.focus(); }, 0);
    };
  }, [open, panelRef]);
}
