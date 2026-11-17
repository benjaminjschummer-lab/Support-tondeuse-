"""Génère les STL des deux supports (même géométrie que supports.scad) avec manifold3d."""
import sys
import numpy as np
from manifold3d import Manifold
import trimesh

FN = 96
depth, tab_len, tab_th, tab_w, hole_d = 16, 9, 3, 11, 3.2
ear_w, ear_len, groove_d, edge_r = 6, 4, 0.6, 1

def cyl(r, h, x=0, y=0, z=0):
    return Manifold.cylinder(h, r, r, FN).translate([x, y, z])

def box(sx, sy, sz, x=0, y=0, z=0):
    return Manifold.cube([sx, sy, sz]).translate([x, y, z])

def rbox(L, W, H, r):
    return Manifold.batch_hull([cyl(r, H, x, y) for x in (r, L - r) for y in (r, W - r)])

def support(L, H, R, floor_h):
    body = rbox(L, depth, H, edge_r)
    tab = Manifold.batch_hull([box(tab_w, 1, tab_th, L/2 - tab_w/2, depth - 1, H - tab_th),
                               cyl(tab_w/2, tab_th, L/2, depth + tab_len - tab_w/2, H - tab_th)])
    ears = [Manifold.batch_hull([box(ear_w, 1, tab_th + 2, x, depth - 1, H - tab_th - 2),
                                 box(ear_w - 1.6, 0.01, tab_th, x + 0.8, depth - 1 + ear_len, H - tab_th)])
            for x in (0, L - ear_w)]
    part = body + tab + ears[0] + ears[1]
    cuts = [cyl(R, H, L/2, 0, floor_h),
            cyl(hole_d/2, tab_th + 2, L/2, depth + tab_len - tab_w/2, H - tab_th - 1)]
    cuts += [box(L - 3, 0.8, 1, 1.5, y, H - groove_d) for y in (depth - 3.5, depth - 1.8)]
    cuts += [box(1, 3, tab_th + 4, x, depth - 2, H - tab_th - 3) for x in (ear_w + 0.5, L - ear_w - 1.5)]
    for c in cuts:
        part = part - c
    return part

def to_trimesh(m):
    mesh = m.to_mesh()
    return trimesh.Trimesh(np.asarray(mesh.vert_properties)[:, :3], np.asarray(mesh.tri_verts))

if __name__ == "__main__":
    big = to_trimesh(support(40, 20, 13, 6))
    small = to_trimesh(support(26, 17, 8.5, 5))
    big.export("support_grand.stl"); small.export("support_petit.stl")
    for n, t in (("grand", big), ("petit", small)):
        print(n, "étanche:", t.is_watertight, "dims:", np.round(t.extents, 1), "vol cm3:", round(t.volume/1000, 2))
