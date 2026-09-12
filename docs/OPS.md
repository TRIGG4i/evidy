# eVidy US — Runtime

Le calculateur est un outil personnel. Le frontend PWA est publié sur GitHub Pages et le moteur reste sur le VPS.

## Runtime
- `evidy-api.service` : API locale sur `127.0.0.1:4280`.
- `evidy-quick-tunnel.service` : URL HTTPS navigateur vers l’API.
- `evidy-healthcheck.timer` : contrôle chaque minute l’API et le tunnel.
- Si l’URL du tunnel change, le healthcheck met à jour `web/config.js`, pousse le core privé et republie automatiquement GitHub Pages.

## PWA
La PWA reprend le comportement E-Pay MG : `display: standalone`, portrait, service worker network-first et installation séparée grâce à l’id `/evidy/`.

## Publication
`./scripts/deploy-pages.sh` publie uniquement `web/` vers `TRIGG4i/evidy:gh-pages`. Le code métier reste dans `TRIGG4i/evidy-core` privé.
