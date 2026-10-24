(() => {
  const BUILD = '20261023-gestion2';
  const versioned = (url) => `${url}?v=${BUILD}`;
  const loadScript = (src) => new Promise((resolve,reject) => { const script=document.createElement('script'); script.src=src; script.async=false; script.onload=resolve; script.onerror=()=>reject(new Error(`Impossible de charger ${src}`)); document.head.appendChild(script); });
  // Ordre de chargement : la synchro d'abord (les modules s'y abonnent), puis le cœur, puis la gestion.
  const files = ['assets/sync.js', 'assets/app-core.js', 'assets/ui.js', 'assets/settings.js', 'assets/invoices.js', 'assets/orders.js', 'assets/clients.js', 'assets/dashboard.js', 'assets/theme-patch.js', 'assets/motion-polish.js', 'assets/quote-sheet-fix.js'];
  files.reduce((chain, file) => chain.then(() => loadScript(versioned(file))), Promise.resolve())
    .then(() => window.EvidySync?.start())
    .catch((error)=>console.error('eVidy US :',error));
})();
