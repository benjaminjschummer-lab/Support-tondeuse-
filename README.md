# Support de charge – Wahl Super Close (3616-0470)

Support imprimable en 3D qui tient le rasoir **debout** et intègre le **passage du câble de charge**.
Appareil : 58 × 108 × 26 mm (l × H × P).

![Vue avant](images/vue_avant.png)
![Avec l'appareil](images/vue_avec_tondeuse.png)
![Dessous](images/vue_dessous.png)

## Fichiers

| Fichier | Usage |
|---|---|
| `stl/support_wahl_super_close_usbc_bas.stl` | Port de charge **sous** l'appareil : la fiche USB‑C est encastrée verticalement dans le fond, il suffit de poser le rasoir dessus. |
| `stl/support_wahl_super_close_cable_arriere.stl` | Port ailleurs (côté/dos) : fente verticale dans la paroi arrière pour brancher le câble pendant que l'appareil est posé. |
| `support_wahl_super_close.scad` | Source paramétrique OpenSCAD (toutes les cotes sont modifiables). |

## Caractéristiques

- Poche de 59,6 × 27,6 mm (jeu de 0,8 mm/côté), profondeur 40 mm à l'arrière, 18 mm à l'avant avec échancrure pour saisir l'appareil.
- Socle 96 × 72 × 24 mm : stable, centre de gravité bas.
- Chambre sous le fond pour que le câble se courbe sans forcer, rainure de sortie à l'arrière (câble Ø 5 mm).
- 4 logements pour patins caoutchouc Ø 10 mm.

## Avant d'imprimer : à vérifier

1. **Position du port de charge** sur ton appareil. S'il est sous l'appareil mais pas centré, ajuste `port_dx` / `port_dy`. S'il n'est pas dessous, prends la version `cable_arriere`.
2. **Taille du surmoulage de ta fiche USB‑C** (la partie plastique) : mesure-la au pied à coulisse et ajuste `plug_w` / `plug_t` (défaut 12,6 × 7,2 mm) pour un serrage ferme.
3. Le rayon des arêtes de l'appareil (`dev_r`, défaut 9 mm) — si ça frotte dans les coins, augmente `clearance` ou `dev_r`.

## Montage (version USB‑C par le bas)

1. Passe le câble par la rainure arrière sous le socle, puis enfile la fiche par-dessous dans la fente du fond.
2. Règle la hauteur pour que seule la partie métallique dépasse du fond, puis bloque avec une goutte de colle chaude.
3. Pose le rasoir : il se branche tout seul.

## Impression

- PLA ou PETG, buse 0,4, couches 0,2 mm, 3 parois, remplissage 15–20 %.
- À plat sur le socle, **sans supports** (la chambre du câble est ouverte vers le bas).
- Environ 170 cm³ de volume extérieur → ~60–80 g de filament selon le remplissage.

## Personnaliser

Ouvre le `.scad` dans OpenSCAD (onglet *Customizer*), modifie les paramètres, puis F6 → *Export STL*.
En ligne de commande :

```sh
openscad -D 'charge_mode="cable"' -D plug_w=12 -o support.stl support_wahl_super_close.scad
```
