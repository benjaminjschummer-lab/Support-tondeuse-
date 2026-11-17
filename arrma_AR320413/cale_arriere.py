"""Cale arrière AR320413 — cotes relevées sur la vue éclatée Arrma (Vorteks 4x4 3S BLX).

Échelle : vis AR721312 (M3x12) dessinée à côté de la cale, projection isométrique
(~9,2 px/mm zoom x6, soit ~0,65 mm par pixel d'origine -> précision ±0,7 mm).
Contrôle : bac batterie 165 mm sans cales / 140 mm avec -> 25 mm pour 2 cales (~12,5 mm chacune, mesuré 13).
Repère : x = longueur (0 = extrémité droite), y = profondeur (0 = face côté batterie), z = hauteur.
"""
import numpy as np, trimesh
from manifold3d import Manifold

FN = 96
L, D, H = 28.0, 13.0, 20.0        # bloc
FLOOR = 7.5                        # hauteur du fond du berceau
CR, CX = 9.0, 26.0                 # rayon / centre (x) du berceau, ouvert côté gauche
TAB_T, LOBE_D, LOBE_X, LOBE_Y, HOLE = 3.0, 10.0, 20.0, 16.4, 3.2
EAR_D, EAR_X, EAR_Y = 6.0, 3.5, 14.0
R_EDGE = 0.8

cyl = lambda r, h, x=0, y=0, z=0: Manifold.cylinder(h, r, r, FN).translate([x, y, z])
box = lambda sx, sy, sz, x=0, y=0, z=0: Manifold.cube([sx, sy, sz]).translate([x, y, z])

def cale():
    body = Manifold.batch_hull([cyl(R_EDGE, H, x, y) for x in (R_EDGE, L - R_EDGE) for y in (R_EDGE, D - R_EDGE)])
    z = H - TAB_T
    tab = Manifold.batch_hull([box(LOBE_D, 1, TAB_T, LOBE_X - LOBE_D / 2, D - 1, z), cyl(LOBE_D / 2, TAB_T, LOBE_X, LOBE_Y, z)])
    ear = Manifold.batch_hull([box(EAR_D, 1, TAB_T, EAR_X - EAR_D / 2, D - 1, z), cyl(EAR_D / 2, TAB_T, EAR_X, EAR_Y, z)])
    part = body + tab + ear
    part -= cyl(CR, H, CX, 0, FLOOR)                       # berceau
    part -= cyl(HOLE / 2, TAB_T + 2, LOBE_X, LOBE_Y, z - 1) # trou M3
    for y in (D - 4.0, D - 2.2):                            # rainures
        part -= box(L - 13, 0.8, 1, 1.5, y, H - 0.6)
    return part

if __name__ == "__main__":
    m = cale().to_mesh()
    t = trimesh.Trimesh(np.asarray(m.vert_properties)[:, :3], np.asarray(m.tri_verts))
    t.export("cale_arriere.stl")
    print("étanche:", t.is_watertight, "dims:", np.round(t.extents, 1))
