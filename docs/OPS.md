# eVidy runtime / publication

- `origin` = dépôt privé `TRIGG4i/evidy-core` : backend, logique métier, tests et source complète.
- `pages` = dépôt public `TRIGG4i/evidy` : frontend GitHub Pages uniquement.
- URL publique : `https://trigg4i.github.io/evidy/`.
- API publique stable : `https://vmi3492066-1.tail1b7515.ts.net:8443` via Tailscale Funnel vers `127.0.0.1:4280`.
- `evidy-api.service` garde l'API locale active.
- `evidy-funnel.service` réapplique le Funnel au démarrage.
- `evidy-healthcheck.timer` vérifie toutes les 5 minutes l'API locale et l'accès HTTPS public et répare le Funnel si nécessaire.
- `scripts/deploy-pages.sh` publie uniquement `web/` dans un historique public propre. Ne jamais pousser `main` vers le dépôt `pages`.
