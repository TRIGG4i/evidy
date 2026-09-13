(() => {
  const BUILD = '20260913-quotehs1';
  const KEY = 'evidyRuntimeBuild';
  window.EVIDY = Object.freeze({ apiBase: 'https://evidy.169-58-138-232.sslip.io', build: BUILD });
  try {
    const previous = localStorage.getItem(KEY);
    if (previous !== BUILD) {
      localStorage.setItem(KEY, BUILD);
      const url = new URL(location.href);
      if (url.searchParams.get('_build') !== BUILD) {
        url.searchParams.set('_build', BUILD);
        Promise.allSettled([
          'caches' in window ? caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))) : Promise.resolve(),
          'serviceWorker' in navigator ? navigator.serviceWorker.getRegistrations().then(rs => Promise.all(rs.map(r => r.unregister()))) : Promise.resolve()
        ]).finally(() => location.replace(url.toString()));
      }
    }
  } catch {}
})();
