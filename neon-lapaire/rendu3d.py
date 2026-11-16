"""Rendu 3D rapide d'une pièce STL (aperçu)."""
import sys, numpy as np, trimesh, matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
m = trimesh.load(sys.argv[1]); out = sys.argv[2]
fig = plt.figure(figsize=(10, 8)); ax = fig.add_subplot(projection="3d")
n = m.face_normals; l = np.array([0.3, -0.4, 0.85]); l /= np.linalg.norm(l)
sh = 0.35 + 0.65 * np.clip(n @ l, 0, 1)
pc = Poly3DCollection(m.triangles, facecolors=np.c_[sh, sh, sh*0.97, np.ones_like(sh)], linewidths=0)
ax.add_collection3d(pc)
b = m.bounds; c = b.mean(0); r = (b[1]-b[0]).max()/2
ax.set_xlim(c[0]-r, c[0]+r); ax.set_ylim(c[1]-r, c[1]+r); ax.set_zlim(0, 2*r)
ax.set_box_aspect((1, 1, 1)); ax.view_init(elev=45, azim=-60); ax.axis("off")
plt.tight_layout(); plt.savefig(out, dpi=90)
