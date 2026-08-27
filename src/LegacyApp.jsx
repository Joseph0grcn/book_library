import { useEffect, useRef, useState } from 'react';
import '../supabase-config.js';

const externalScripts = [
  'https://cdn.jsdelivr.net/npm/@ericblade/quagga2/dist/quagga.min.js',
  'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2'
];

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      if (existing.dataset.loaded === 'true') resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.async = false;
    script.onload = () => {
      script.dataset.loaded = 'true';
      resolve();
    };
    script.onerror = () => reject(new Error(`Bağımlılık yüklenemedi: ${src}`));
    document.head.appendChild(script);
  });
}

function injectLegacyMarkup(markup) {
  const parsed = new DOMParser().parseFromString(markup, 'text/html');
  const root = document.getElementById('legacy-runtime-root');
  root.textContent = '';
  Array.from(parsed.body.children).forEach((element) => {
    if (element.tagName !== 'SCRIPT') root.appendChild(document.importNode(element, true));
  });
}

export default function LegacyApp() {
  const initialized = useRef(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialized.current) return undefined;
    initialized.current = true;
    let cancelled = false;

    async function startLegacyRuntime() {
      try {
        const response = await fetch('/legacy.html');
        if (!response.ok) throw new Error('Eski uygulama şablonu yüklenemedi.');
        injectLegacyMarkup(await response.text());
        for (const script of externalScripts) await loadScript(script);
        if (!cancelled) {
          await import('../js/main.js');
          if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js');
        }
      } catch (runtimeError) {
        if (!cancelled) setError(runtimeError.message || 'Uygulama başlatılamadı.');
      }
    }

    startLegacyRuntime();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return <main className="react-runtime-error"><h1>Kitap Kütüphanem</h1><p>{error}</p><a href="/legacy.html">Fallback uygulamayı aç</a></main>;
  }
  return <div id="legacy-runtime-root" className="legacy-runtime-loading" aria-live="polite">Uygulama yükleniyor...</div>;
}
