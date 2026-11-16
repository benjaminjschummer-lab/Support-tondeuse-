"""
Générateur de support néon LED (ruban 6x12 mm) imprimable en 3D
à partir du logo LAPAIRE.

Usage : python3 generate.py
Sorties : stl/*.stl, apercu.png, gabarit_mural.svg
"""
import os, math, json
import cv2, numpy as np
import trimesh
from shapely.geometry import Polygon, LineString, Point, MultiPolygon
from shapely.ops import unary_union, substring
from shapely import affinity

# ---------------- PARAMÈTRES ----------------
LOGO       = "logo_lapaire.png"
LARGEUR    = 650.0   # largeur totale des lettres (mm)
NEON_L     = 6.0     # largeur du néon (mm)
JEU        = 0.4     # jeu total dans la gorge (mm)
PAROI      = 1.6     # épaisseur des parois (mm)
FOND       = 3.0     # épaisseur du fond (mm)
PROF       = 10.0    # profondeur de gorge (néon 12 mm -> dépasse de 2 mm)
RETRAIT    = 5.0     # retrait de l'axe du néon vers l'intérieur de la lettre (mm)
RAYON      = 10.0    # rayon de courbure mini du néon (mm)
LONG_MIN   = 60.0    # boucles plus courtes ignorées (mm)
PLATEAU    = 250.0   # taille utile du plateau (mm)
VIS_PAS    = 140.0   # espacement des trous de vis (mm)
VIS_D      = 3.4     # trou de vis M3 / vis à bois 3 mm
VIS_TETE   = 6.5     # diamètre de fraisure
CABLE_D    = 6.0     # trou de passage du câble
# --------------------------------------------

G = (NEON_L + JEU) / 2          # demi-largeur gorge
E = G + PAROI                   # demi-largeur extérieure
H = FOND + PROF

from squelette import graphe, elaguer, traces
from scipy.ndimage import gaussian_filter1d

ELAG    = 20.0   # ergots du squelette plus courts que ça supprimés (mm)
LISSAGE = 7.0    # lissage du tracé (mm, sigma gaussien)

def composantes():
    im = cv2.imread(LOGO, 0)
    b = (im > 128).astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(b, 8)
    H_, W_ = b.shape
    out = []
    for i in range(1, n):
        x, y, w, h, a = st[i]
        if x == 0 or y == 0 or x + w >= W_ or y + h >= H_ or a < 2000:
            continue
        out.append(((lab == i).astype(np.uint8), x))
    out.sort(key=lambda t: t[1])
    xs = [t[1] for t in out]
    return [t[0] for t in out]

def echelle(masks):
    u = np.zeros_like(masks[0])
    for m in masks: u |= m
    ys, xs = np.nonzero(u)
    s = LARGEUR / (xs.max() - xs.min())
    return s, xs.min(), ys.max()

def lisser(pts, ferme):
    a = np.array(pts, float)
    # rééchantillonnage à 1 mm
    d = np.r_[0, np.cumsum(np.hypot(*np.diff(a, axis=0).T))]
    L = d[-1]
    if L < 2: return a
    t = np.linspace(0, L, max(int(L), 3))
    a = np.c_[np.interp(t, d, a[:, 0]), np.interp(t, d, a[:, 1])]
    if ferme:
        sm = np.c_[gaussian_filter1d(a[:, 0], LISSAGE, mode="wrap"),
                   gaussian_filter1d(a[:, 1], LISSAGE, mode="wrap")]
    else:
        # réflexion impaire aux extrémités : la pointe reste en place, sans coude
        k = min(len(a) - 1, int(4 * LISSAGE))
        pad = np.r_[2 * a[0] - a[k:0:-1], a, 2 * a[-1] - a[-2:-k-2:-1]]
        sm = np.c_[gaussian_filter1d(pad[:, 0], LISSAGE), gaussian_filter1d(pad[:, 1], LISSAGE)]
        sm = sm[k:k + len(a)]
    return sm

def rayon_min(a):
    if len(a) < 7: return 999
    p0, p1, p2 = a[:-6], a[3:-3], a[6:]
    A = np.hypot(*(p1-p0).T); B = np.hypot(*(p2-p1).T); C = np.hypot(*(p2-p0).T)
    cross = np.abs((p1-p0)[:,0]*(p2-p0)[:,1] - (p1-p0)[:,1]*(p2-p0)[:,0])
    R = A*B*C / (2*cross + 1e-9)
    return float(np.percentile(R, 1))

def traces_lettre(mask, s, x0, y1):
    m = cv2.GaussianBlur(mask * 255, (0, 0), 3) > 127
    ar = elaguer(graphe(m.astype(np.uint8)), ELAG / s)
    res = []
    for pts, ferme in traces(ar):
        mm = [((c - x0) * s, (y1 - r) * s) for r, c in pts]
        if longueur_mm(mm) < 15: continue
        res.append((lisser(mm, ferme), ferme))
    # raccourcir les extrémités qui butent sur un autre tracé
    lignes = [LineString(a) for a, _ in res]
    out = []
    for k, (a, ferme) in enumerate(res):
        ls = lignes[k]
        if not ferme:
            autres = unary_union([l for j, l in enumerate(lignes) if j != k])
            for bout in (0, -1):
                p = Point(a[bout])
                if not autres.is_empty and p.distance(autres) < E:
                    L = ls.length
                    cut = G - 0.8
                    ls = substring(ls, cut, L) if bout == 0 else substring(ls, 0, L - cut)
            a = np.array(ls.coords)
        out.append((LineString(a) if not ferme else LineString(np.r_[a, a[:1]]), ferme))
    return out

def parts(g):
    if g.is_empty: return []
    return list(g.geoms) if hasattr(g, "geoms") else [g]

def longueur_mm(c):
    a = np.array(c); return np.sum(np.hypot(*np.diff(a, axis=0).T))

def ext3d(poly, z0, z1):
    ms = []
    for q in parts(poly):
        m = trimesh.creation.extrude_polygon(q, z1 - z0)
        m.apply_translation([0, 0, z0])
        ms.append(m)
    return trimesh.util.concatenate(ms)

def piece(rings):
    gorge = unary_union([r.buffer(G, resolution=24, cap_style=2) for r, f in rings])
    exte  = unary_union([r.buffer(E, resolution=24) for r, f in rings])
    murs  = exte.difference(gorge)
    solide = trimesh.boolean.union([ext3d(exte, 0, FOND), ext3d(murs, FOND - 0.01, H)],
                                   engine="manifold")
    trous = []
    vis_pts = []
    # trous de vis fraisés dans le fond de gorge + 1 passage de câble par boucle
    for r, f in rings:
        L = r.length
        nv = max(1 if L < 90 else 2, round(L / VIS_PAS))
        for k in range(nv):
            pt = r.interpolate(15 + (k + 0.5) * (L - 15) / nv)
            vis_pts.append(pt)
            cyl = trimesh.creation.cylinder(radius=VIS_D/2, height=3*H, sections=32)
            cyl.apply_translation([pt.x, pt.y, 0])
            cone = trimesh.creation.cone(radius=VIS_TETE/2 + (FOND), height=VIS_TETE/2 + FOND, sections=32)
            cone.apply_transform(trimesh.transformations.rotation_matrix(math.pi, [1, 0, 0]))
            cone.apply_translation([pt.x, pt.y, FOND + 0.01 + (VIS_TETE/2 - VIS_D/2) * 0 + 0.0])
            # cone pointe en bas : sommet à z = FOND - (VIS_TETE/2+FOND) -> fraisure 90°
            trous += [cyl, cone]
        pt = r.interpolate(4.0)
        c = trimesh.creation.cylinder(radius=CABLE_D/2, height=3*H, sections=32)
        c.apply_translation([pt.x, pt.y, 0])
        trous.append(c)
    solide = trimesh.boolean.difference([solide] + trous, engine="manifold")
    return solide, exte, gorge, vis_pts

def orienter(poly):
    """Rotation qui minimise l'encombrement sur le plateau."""
    best = None
    for a in range(0, 180, 2):
        q = affinity.rotate(poly, a, origin=(0, 0))
        x0, y0, x1, y1 = q.bounds
        w, h = x1 - x0, y1 - y0
        sc = max(w, h)
        if best is None or sc < best[0]:
            best = (sc, a, w, h)
    return best

def main():
    os.makedirs("stl", exist_ok=True)
    masks = composantes()
    s, x0, y1 = echelle(masks)
    noms = ["L", "A", "P", "A2", "I", "R", "E"]
    infos, apercu = [], []
    neon_total = 0
    for i, mk in enumerate(masks):
        nom = noms[i] if i < len(noms) else f"X{i}"
        rings = traces_lettre(mk, s, x0, y1)
        cs, _ = cv2.findContours(mk, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        p = unary_union([Polygon([((c - x0) * s, (y1 - r) * s) for c, r in cc[:, 0, :]]).buffer(0)
                         for cc in cs if len(cc) > 2])
        if not rings:
            print("!! lettre vide", nom); continue
        sol, exte, gorge, vis = piece(rings)
        taille, ang, w, h = orienter(exte)
        # export orienté à plat, centré
        sol_o = sol.copy()
        sol_o.apply_transform(trimesh.transformations.rotation_matrix(math.radians(ang), [0, 0, 1]))
        b = sol_o.bounds
        sol_o.apply_translation([-(b[0][0]+b[1][0])/2, -(b[0][1]+b[1][1])/2, -b[0][2]])
        f = f"stl/{i+1:02d}_lettre_{nom}.stl"
        sol_o.export(f)
        L = sum(r.length for r, f in rings)
        rmin = min(rayon_min(np.array(r.coords)) for r, f in rings)
        neon_total += L
        infos.append(dict(fichier=f, troncons_neon=len(rings), rayon_min_mm=round(rmin), neon_mm=round(L), plateau_mm=[round(w), round(h)],
                          etanche=bool(sol.is_watertight), ok_plateau=bool(max(w, h) <= PLATEAU)))
        apercu.append((nom, p, exte, gorge, rings, vis))
        print(infos[-1])
    print("Longueur néon totale ≈ %.2f m" % (neon_total / 1000))
    json.dump(dict(echelle_mm_par_px=s, pieces=infos, neon_total_m=round(neon_total/1000, 2)),
              open("pieces.json", "w"), indent=1, ensure_ascii=False)
    dessiner(apercu)
    svg(apercu)

def dessiner(apercu):
    import matplotlib; matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.patches import PathPatch
    from matplotlib.path import Path
    def patch(ax, g, **kw):
        for q in parts(g):
            verts, codes = [], []
            for r in [q.exterior] + list(q.interiors):
                c = list(r.coords); verts += c
                codes += [Path.MOVETO] + [Path.LINETO]*(len(c)-2) + [Path.CLOSEPOLY]
            ax.add_patch(PathPatch(Path(verts, codes), **kw))
    fig, axs = plt.subplots(2, 1, figsize=(16, 12), facecolor="#111")
    for ax in axs:
        ax.set_facecolor("#111"); ax.set_aspect("equal"); ax.axis("off")
    for nom, p, exte, gorge, rings, vis in apercu:
        patch(axs[0], p, fc="#333", ec="none")
        patch(axs[0], exte, fc="#ddd", ec="#888", lw=0.3)
        patch(axs[0], gorge, fc="#777", ec="none")
        for r, fe in rings:
            x, y = r.xy
            axs[1].plot(x, y, color="#ffb020", lw=5, solid_capstyle="round", alpha=0.35)
            axs[1].plot(x, y, color="#ffe9a8", lw=1.6)
    u = unary_union([a[2] for a in apercu]); x0, y0, x1, y1 = u.bounds
    for ax in axs:
        ax.set_xlim(x0-10, x1+10); ax.set_ylim(y0-10, y1+10)
    axs[0].set_title("Supports (gris clair) sur le logo (gris foncé)", color="w")
    axs[1].set_title("Rendu néon", color="w")
    plt.tight_layout(); plt.savefig("apercu.png", dpi=110, facecolor="#111")

def svg(apercu):
    u = unary_union([a[2] for a in apercu]); x0, y0, x1, y1 = u.bounds
    W, Hh = x1 - x0 + 40, y1 - y0 + 40
    def path(g):
        d = ""
        for q in parts(g):
            for r in [q.exterior] + list(q.interiors):
                c = list(r.coords)
                d += "M" + " L".join(f"{x-x0+20:.2f},{y1-y+20:.2f}" for x, y in c) + " Z "
        return d
    with open("gabarit_mural.svg", "w") as f:
        f.write(f'<svg xmlns="http://www.w3.org/2000/svg" width="{W:.1f}mm" height="{Hh:.1f}mm" viewBox="0 0 {W:.1f} {Hh:.1f}">\n')
        f.write('<rect width="100%" height="100%" fill="white"/>\n')
        for nom, p, exte, gorge, rings, vis in apercu:
            f.write(f'<path d="{path(exte)}" fill="none" stroke="black" stroke-width="0.4" fill-rule="evenodd"/>\n')
            for v in vis:
                f.write(f'<circle cx="{v.x-x0+20:.2f}" cy="{y1-v.y+20:.2f}" r="1.7" fill="none" stroke="red" stroke-width="0.3"/>'
                        f'<path d="M{v.x-x0+17:.2f},{y1-v.y+20:.2f} h6 M{v.x-x0+20:.2f},{y1-v.y+17:.2f} v6" stroke="red" stroke-width="0.2"/>\n')
            c = exte.centroid
            f.write(f'<text x="{c.x-x0+20:.1f}" y="{y1-c.y+20:.1f}" font-size="12" fill="red">{nom}</text>\n')
        f.write('</svg>\n')

if __name__ == "__main__":
    main()
