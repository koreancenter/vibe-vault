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

