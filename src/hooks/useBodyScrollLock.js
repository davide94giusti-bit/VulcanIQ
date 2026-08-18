import { useEffect } from 'react';

let bodyScrollLockCount = 0;
let bodyScrollLockSnapshot = null;

export default function useBodyScrollLock(isLocked) {
  useEffect(() => {
    if (!isLocked || typeof document === 'undefined') return undefined;

    if (bodyScrollLockCount === 0) {
      const scrollY = window.scrollY || document.documentElement.scrollTop || 0;
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      bodyScrollLockSnapshot = {
        overflow: document.body.style.overflow,
        paddingRight: document.body.style.paddingRight,
        position: document.body.style.position,
        top: document.body.style.top,
        left: document.body.style.left,
        right: document.body.style.right,
        width: document.body.style.width,
        scrollY
      };
      document.body.style.overflow = 'hidden';
      document.body.style.position = 'fixed';
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = '0';
      document.body.style.right = '0';
      document.body.style.width = '100%';
      document.body.classList.add('modal-scroll-lock');
      if (scrollbarWidth > 0) document.body.style.paddingRight = `${scrollbarWidth}px`;
    }

    bodyScrollLockCount += 1;

    return () => {
      bodyScrollLockCount = Math.max(0, bodyScrollLockCount - 1);
      if (bodyScrollLockCount === 0 && bodyScrollLockSnapshot) {
        const restoreScrollY = bodyScrollLockSnapshot.scrollY || 0;
        document.body.style.overflow = bodyScrollLockSnapshot.overflow;
        document.body.style.paddingRight = bodyScrollLockSnapshot.paddingRight;
        document.body.style.position = bodyScrollLockSnapshot.position;
        document.body.style.top = bodyScrollLockSnapshot.top;
        document.body.style.left = bodyScrollLockSnapshot.left;
        document.body.style.right = bodyScrollLockSnapshot.right;
        document.body.style.width = bodyScrollLockSnapshot.width;
        document.body.classList.remove('modal-scroll-lock');
        bodyScrollLockSnapshot = null;
        window.scrollTo(0, restoreScrollY);
      }
    };
  }, [isLocked]);
}
