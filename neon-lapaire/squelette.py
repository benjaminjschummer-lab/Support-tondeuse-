"""Extraction des tracés néon (axes centraux des traits) depuis un masque binaire."""
import numpy as np, cv2, math
from skimage.morphology import skeletonize

NB = [(-1,-1),(-1,0),(-1,1),(0,-1),(0,1),(1,-1),(1,0),(1,1)]

def graphe(mask):
    sk = skeletonize(mask > 0).astype(np.uint8)
    pts = set(zip(*np.nonzero(sk)))
    def voisins(p):
        return [(p[0]+a, p[1]+b) for a, b in NB if (p[0]+a, p[1]+b) in pts]
    deg = {p: len(voisins(p)) for p in pts}
    noeuds = {p for p in pts if deg[p] != 2}
    # regrouper les pixels-noeuds adjacents (jonctions épaisses)
    cluster, cid = {}, 0
    for p in noeuds:
        if p in cluster: continue
        pile = [p]; cluster[p] = cid
        while pile:
            q = pile.pop()
            for v in voisins(q):
                if v in noeuds and v not in cluster:
                    cluster[v] = cid; pile.append(v)
        cid += 1
    aretes, vus = [], set()
    for p in noeuds:
        for v in voisins(p):
            if v in noeuds: continue
            if (p, v) in vus: continue
            chemin = [p, v]; prev, cur = p, v
            while cur not in noeuds:
                nx = [w for w in voisins(cur) if w != prev and w not in chemin[-3:]]
                if not nx: break
                prev, cur = cur, nx[0]; chemin.append(cur)
            if cur in noeuds:
                vus.add((cur, chemin[-2]))
            aretes.append([cluster[chemin[0]], cluster.get(chemin[-1], -1), chemin])
    # boucles sans noeud (cercle fermé)
    restants = pts - {q for e in aretes for q in e[2]} - noeuds
    if restants and not aretes:
        p = next(iter(restants)); chemin = [p]; prev = None; cur = p
        while True:
            nx = [w for w in voisins(cur) if w != prev and w in restants]
            if not nx or (len(chemin) > 3 and p in voisins(cur)): break
            prev, cur = cur, nx[0]; chemin.append(cur)
        chemin.append(p)
        aretes.append([cid, cid, chemin]); cid += 1
    return aretes

def longueur(c):
    a = np.array(c, float); return np.sum(np.hypot(*np.diff(a, axis=0).T))

def elaguer(aretes, lmin):
    """Supprime les petites branches (ergots) terminales, puis fusionne."""
    while True:
        deg = {}
        for a, b, c in aretes:
            deg[a] = deg.get(a, 0) + 1; deg[b] = deg.get(b, 0) + 1
        cand = [e for e in aretes if (deg[e[0]] == 1) != (deg[e[1]] == 1)
                and longueur(e[2]) < lmin]
        if not cand: break
        cand.sort(key=lambda e: longueur(e[2]))
        aretes.remove(cand[0])
    return aretes

def direction(chemin, depuis_debut, n=12):
    c = np.array(chemin, float)
    if not depuis_debut: c = c[::-1]
    k = min(n, len(c)-1)
    d = c[k] - c[0]; return d / (np.linalg.norm(d) + 1e-9)

def traces(aretes):
    """Assemble les arêtes en tracés continus : à chaque jonction on enchaîne
    les deux branches les plus alignées (le néon passe tout droit)."""
    inc = {}
    for i, (a, b, c) in enumerate(aretes):
        inc.setdefault(a, []).append((i, True)); inc.setdefault(b, []).append((i, False))
    lien = {}  # (arete, extremite) -> (arete, extremite)
    for n, lst in inc.items():
        lst = list(lst)
        while len(lst) >= 2:
            best = None
            for x in range(len(lst)):
                for y in range(x+1, len(lst)):
                    (i, si), (j, sj) = lst[x], lst[y]
                    if i == j: continue
                    di = direction(aretes[i][2], si); dj = direction(aretes[j][2], sj)
                    sc = np.dot(di, dj)  # -1 = parfaitement opposées = alignées
                    if best is None or sc < best[0]: best = (sc, x, y)
            if best is None or best[0] > -0.2: break
            _, x, y = best
            lien[lst[x]] = lst[y]; lien[lst[y]] = lst[x]
            lst = [l for k, l in enumerate(lst) if k not in (x, y)]
    utilise, res = set(), []
    def chaine(i, depart_debut):
        pts = []; cur, deb = i, depart_debut
        while cur not in utilise:
            utilise.add(cur)
            c = aretes[cur][2]
            seg = c if deb else c[::-1]
            pts += seg if not pts else seg[1:]
            fin = (cur, not deb)   # extrémité de sortie
            if fin not in lien: break
            cur, deb = lien[fin]
        return pts
    # démarrer depuis les extrémités libres d'abord
    for i in range(len(aretes)):
        for s in (True, False):
            if i not in utilise and (i, s) not in lien:
                res.append((chaine(i, s), False))
    for i in range(len(aretes)):
        if i not in utilise:
            p = chaine(i, True); res.append((p, True))
    return res
