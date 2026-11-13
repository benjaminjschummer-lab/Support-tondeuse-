# Distributeur de demi-lames à gravité (barbershop)

Distributeur de comptoir pour **demi-lames** (lames double tranchant coupées en deux, pour shavette / coupe-chou à lame interchangeable).
On charge les lames par le haut, on ferme le couvercle, et en bas on tire **une seule lame à la fois** vers soi.

![Vue d'ensemble](images/vue_avant.png)
![Dessous / sortie](images/vue_dessous_avant.png)

## Imprimer sur Bambu Lab A1 – prêt à l'emploi

Fichier : **`bambu/Distributeur_demi_lames_A1_PLA_noir.3mf`** (corps + couvercle sur le même plateau).

1. Double-clique sur le fichier pour l'ouvrir dans Bambu Studio (accepte de charger les réglages du projet si on te le demande).
2. Clique sur **Découper le plateau**, puis sur **Imprimer**.
3. Vérifie que le filament du projet (noir) pointe vers l'emplacement AMS qui contient ton PLA noir.

Réglages : A1 buse 0,4, 0,20 mm Standard, Bambu PLA Basic noir, 3 parois, gyroïde 15 %, **sans supports**.
Le corps est **couché sur le côté** sur le plateau : c'est voulu, la fente de sortie est ainsi imprimée dans le plan horizontal, là où l'imprimante est la plus précise.

## Utilisation

1. Retire le couvercle et dépose les demi-lames **à plat**, **tranchant vers l'arrière** (le dos non coupant vers toi).
2. Remets le couvercle.
3. Glisse un doigt dans la niche sous le distributeur, pose-le sur la lame du bas à travers la fenêtre, et tire vers toi : la lame sort par la fente avant, par son dos.
4. Attrape-la par le dos et mets-la dans ta shavette.

La fente latérale permet de voir le stock restant. Capacité : environ 400 demi-lames.

Le socle est compact (36 mm de profondeur) : tiens le haut du distributeur de l'autre main en tirant, ou colle-le au comptoir avec un carré d'adhésif double face ou des patins antidérapants.

## Dimensions

| | |
|---|---|
| Demi-lame prévue | 43 × 11,1 × 0,1 mm (lame DE standard 43 × 22,2 mm coupée en deux) |
| Réserve intérieure | 44,2 × 12,0 mm, 40 mm de haut |
| Fente de sortie | 0,18 mm de haut (plus d'une lame de 0,1 mm, moins de deux) |
| Encombrement | 49 × 36 mm au sol, 59 mm de haut + couvercle |

## Si ça ne sort pas parfaitement

La fente est très fine (0,18 mm), elle dépend donc un peu de l'imprimante :
- **Deux lames sortent ensemble** : colle un morceau de ruban adhésif fin (scotch d'électricien ou aluminium) sur le bas de la paroi avant, à l'intérieur, pour réduire la fente.
- **La lame bloque** : passe une ancienne lame dans la fente d'avant en arrière, une ou deux fois, pour l'ébavurer.
- Pour une autre taille de lame, ou pour régler la fente, modifie `blade_l`, `blade_w` ou `gap` dans `distributeur_demi_lames.scad`, puis relance `../outils/generer_projet_bambu.py`.

## Fichiers

- `bambu/Distributeur_demi_lames_A1_PLA_noir.3mf` – projet Bambu Studio prêt à imprimer
- `stl/distributeur_corps.stl`, `stl/distributeur_couvercle.stl` – pièces en orientation d'impression
- `distributeur_demi_lames.scad` – source paramétrique (`part` = assembly / body / lid / print)
