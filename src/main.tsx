import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Prevent mouse wheel from unintentionally changing number input values
document.addEventListener(
  'wheel',
  () => {
    if (
      document.activeElement instanceof HTMLInputElement &&
      document.activeElement.type === 'number'
    ) {
      document.activeElement.blur();
    }
  },
  { passive: true }
);

// Chrome DevTools Issues flags form fields lacking id/name; assign stable ids to dynamically rendered fields.
let formFieldSeq = 0;
const labelUnnamedFields = (root: ParentNode) => {
  root.querySelectorAll<HTMLInputElement>('input:not([id]):not([name]), textarea:not([id]):not([name]), select:not([id]):not([name])')
    .forEach((el) => {
      el.id = `field-${++formFieldSeq}`;
    });
};
new MutationObserver((records) => {
  for (const r of records) {
    r.addedNodes.forEach((n) => {
      if (n instanceof HTMLElement) {
        if (n.matches('input,textarea,select') && !n.id && !n.getAttribute('name')) n.id = `field-${++formFieldSeq}`;
        labelUnnamedFields(n);
      }
    });
  }
}).observe(document.body, { childList: true, subtree: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);


// Register the service worker during idle time after load using the native API
// to avoid chaining virtual:pwa-register -> workbox-window JS chunks on initial load.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener(
    'load',
    () => {
      const register = () => {
        navigator.serviceWorker
          .register('/sw.js', { scope: '/', updateViaCache: 'none' })
          .catch(() => {
            // Ignore registration errors in restricted/private browsing contexts
          });
      };
      const w = window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      };
      if (typeof w.requestIdleCallback === 'function') {
        w.requestIdleCallback(register, { timeout: 3000 });
      } else {
        setTimeout(register, 2000);
      }
    },
    { once: true }
  );
}
