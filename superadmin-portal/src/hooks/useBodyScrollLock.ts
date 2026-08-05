import { useEffect } from 'react';

/** Locks document scroll while open; restores immediately on close (iOS-safe). */
export function useBodyScrollLock(locked: boolean) {
  useEffect(() => {
    if (!locked || typeof document === 'undefined') return;

    const { body, documentElement } = document;
    const prevBodyOverflow = body.style.overflow;
    const prevBodyTouch = body.style.touchAction;
    const prevHtmlOverflow = documentElement.style.overflow;
    const scrollY = window.scrollY;

    body.style.overflow = 'hidden';
    body.style.touchAction = 'none';
    body.style.position = 'fixed';
    body.style.top = `-${scrollY}px`;
    body.style.left = '0';
    body.style.right = '0';
    body.style.width = '100%';

    return () => {
      body.style.overflow = prevBodyOverflow;
      body.style.touchAction = prevBodyTouch;
      body.style.position = '';
      body.style.top = '';
      body.style.left = '';
      body.style.right = '';
      body.style.width = '';
      documentElement.style.overflow = prevHtmlOverflow;
      window.scrollTo(0, scrollY);
    };
  }, [locked]);
}
