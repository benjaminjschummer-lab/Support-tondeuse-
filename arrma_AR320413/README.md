# Supports Arrma ARAC3109 / AR320413 (reproduction)

Modèle 3D recréé d'après photo : un grand et un petit support avec berceau arrondi,
patte arrière percée (vis M3) et oreilles latérales.

- `supports.scad` : modèle paramétrique OpenSCAD (modifier les cotes en haut du fichier)
- `generate.py` : régénère les STL (`pip install manifold3d trimesh numpy`)
- `support_grand.stl` (40 × 25 × 20 mm), `support_petit.stl` (26 × 25 × 17 mm)

⚠️ Cotes **estimées** d'après la photo : mesurer la pièce d'origine (ou le logement)
et ajuster `L`, `H`, `R` (rayon du berceau), `floor_h` et `depth` avant impression.

Impression conseillée : PETG/ASA ou PA-CF, 4 périmètres, 40 % de remplissage,
posé sur sa face inférieure (aucun support nécessaire).

## Cale arrière seule (v2, cotes relevées)

`cale_arriere.stl` / `cale_arriere.py` : 28 × 13 × 20 mm (bloc), patte Ø10 avec trou M3.
Cotes relevées sur la vue éclatée officielle (Vorteks 4x4 3S BLX) avec la vis M3×12
AR721312 comme étalon (précision ±0,7 mm). Contrôle : bac 165 mm sans cales, 140 mm avec.
