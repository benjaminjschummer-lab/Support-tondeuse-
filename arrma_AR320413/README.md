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
