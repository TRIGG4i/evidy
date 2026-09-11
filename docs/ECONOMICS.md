# Modèle économique eVidy US — v0.1

## Commission

Le taux est choisi selon le prix de l'article :

- 0,50 à 350 USD : 30 %
- 351 à 900 USD : 25 %
- plus de 900 USD : 15 %
- minimum absolu : 75 000 MGA

Pour éviter qu'un article à 351 USD rapporte moins qu'un article à 350 USD, le moteur applique un plancher de continuité à chaque changement de tranche.

La commission est calculée sur le coût d'achat de l'article et de sa livraison vendeur aux États-Unis, hors fret international. Le tarif public Planet Express et la réserve d'arrivée fournissent déjà un coussin de sécurité supplémentaire ; appliquer la commission une seconde fois au fret risquerait de rendre le devis non compétitif.

## Coût carte

Le modèle E-Pay MG est conservé comme base : taux VISA du jour avec Bank fee 4 %, puis frais carte de 3 % + 4 500 MGA par paiement. eVidy modélise séparément l'achat vendeur et le paiement Planet Express, car ils sont généralement deux transactions distinctes.

## Douane / arrivée

La réserve est séparée de la marge eVidy. Valeurs initiales de travail :

- petit colis : 200 000 MGA
- colis moyen : 350 000 MGA
- volumineux : 1 300 000 MGA

Ces valeurs doivent être affinées avec l'historique réel. Elles ne constituent pas un barème douanier officiel.
