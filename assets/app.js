(() => {
  const BUILD = '20260913-quotehs1';
  const versioned = (url) => `${url}?v=${BUILD}`;
  const loadStyle = (href) => { const link=document.createElement('link'); link.rel='stylesheet'; link.href=href; document.head.appendChild(link); };
  const loadScript = (src) => new Promise((resolve,reject) => { const script=document.createElement('script'); script.src=src; script.async=false; script.onload=resolve; script.onerror=()=>reject(new Error(`Impossible de charger ${src}`)); document.head.appendChild(script); });
  loadStyle(versioned('assets/premium-fixes.css'));
  loadScript(versioned('assets/app-core.js'))
    .then(()=>loadScript(versioned('assets/theme-patch.js')))
    .then(()=>loadScript(versioned('assets/motion-polish.js')))
    .then(()=>loadScript(versioned('assets/quote-sheet-fix.js')))
    .catch((error)=>console.error('eVidy US :',error));
})();