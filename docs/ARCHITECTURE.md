# Architecture eVidy

## Positionnement

eVidy US est un service d'achat assisté aux États-Unis pour Madagascar. Le produit ne se présente pas comme un importateur. PREST OFFICE reste l'entité opératrice et la marque eVidy reste autonome côté client.

## Principe de calcul

1. Le lien produit est analysé pour récupérer prix, état, poids et dimensions lorsqu'ils existent.
2. Si le poids/dimensions d'expédition sont absents, un estimateur prudent propose une fourchette et un niveau de confiance.
3. Le backend interroge le calculateur public Planet Express et récupère les tarifs DHL/FedEx en temps réel.
4. Le montant USD payé par carte est converti avec le taux VISA USD→MGA. Le taux peut être actualisé automatiquement ou saisi manuellement si Visa bloque l'automatisation.
5. Une réserve douane/arrivée distincte est ajoutée. Elle n'est pas une estimation de droits officiels et n'utilise aucune sous-déclaration automatique.
6. La commission eVidy est calculée par tranche de prix et intégrée au prix final tout compris.

## Hébergement

- Frontend statique : GitHub Pages.
- API : Node.js sur le VPS, exposée temporairement par tunnel HTTPS. Un domaine stable remplacera le tunnel avant lancement commercial.
- Aucune clé API n'est envoyée au navigateur.

## Dégradation sûre

Si Planet Express, Visa ou l'analyse de lien deviennent indisponibles, le calculateur reste utilisable en mode manuel. Les valeurs de secours sont toujours étiquetées comme telles.
