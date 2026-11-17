#!/usr/bin/env python3
"""Génère un projet Bambu Studio (.3mf) prêt à imprimer pour la Bambu Lab A1.

- Profils officiels Bambu (dépôt bambulab/BambuStudio, resources/profiles/BBL)
  entièrement résolus (héritage + includes) : imprimante « Bambu Lab A1 0.4 nozzle »,
  qualité « 0.20mm Standard @BBL A1 », filament « Bambu PLA Basic @BBL A1 » noir.
- Pièce posée au centre du plateau, sans supports.

Usage :
  python3 generer_projet_bambu.py --profils <dossier BBL> --sortie projet.3mf \
      --nom "Nom" [--miniature plate.png] [--reglages '{"wall_loops": "3"}'] \
      piece1.stl[@dx,dy] piece2.stl[@dx,dy] ...
  (dx, dy : décalage en mm par rapport au centre du plateau)
"""
import json, sys, os, zipfile, argparse
import numpy as np
import trimesh

PRINTER  = "Bambu Lab A1 0.4 nozzle"
PROCESS  = "0.20mm Standard @BBL A1"
FILAMENT = "Bambu PLA Basic @BBL A1"
COLOUR   = "#000000"
APP_VER  = "02.00.00.00"
BED_CENTER = (128.0, 128.0)   # plateau A1 : 256 x 256 mm

# Réglages modifiés par rapport au profil système (solidité du support)
PROCESS_OVERRIDES = {
    "wall_loops": "3",
    "sparse_infill_density": "20%",
    "sparse_infill_pattern": "gyroid",
    "enable_support": "0",
    "brim_type": "no_brim",
}

META = {"type", "name", "inherits", "from", "setting_id", "instantiation", "include",
        "description", "renamed_from", "compatible_printers", "compatible_printers_condition",
        "compatible_prints", "compatible_prints_condition", "filament_id", "url"}


def index_profiles(root):
    idx = {}
    for sub in ("machine", "process", "filament"):
        for f in os.listdir(os.path.join(root, sub)):
            if f.endswith(".json"):
                with open(os.path.join(root, sub, f)) as fh:
                    d = json.load(fh)
                if "name" in d:
                    idx[(sub, d["name"])] = d
    return idx


def resolve(idx, sub, name):
    d = idx[(sub, name)]
    out = {}
    if d.get("inherits"):
        out.update(resolve(idx, sub, d["inherits"]))
    for inc in d.get("include", []) or []:
        out.update(resolve(idx, sub, inc))
    out.update(d)
    return out


def build_config(root, overrides, colour=COLOUR):
    idx = index_profiles(root)
    machine = resolve(idx, "machine", PRINTER)
    process = resolve(idx, "process", PROCESS)
    filament = resolve(idx, "filament", FILAMENT)
    cfg = {}
    for src in (machine, process):
        cfg.update({k: v for k, v in src.items() if k not in META})
    for k, v in filament.items():
        if k in META:
            continue
        cfg[k] = v if isinstance(v, list) else [v]
    cfg.update(overrides)
    cfg.update({
        "filament_colour": [colour],
        "filament_ids": [filament.get("filament_id", "GFA00")],
        "filament_settings_id": [FILAMENT],
        "print_settings_id": PROCESS,
        "printer_settings_id": PRINTER,
        "curr_bed_type": "Textured PEI Plate",
        "different_settings_to_system": [";".join(sorted(overrides)), "", ""],
        "inherits_group": [PROCESS, FILAMENT, PRINTER],
        "from": "project",
        "name": "project_settings",
        "inherits": "",
        "version": APP_VER,
    })
    return dict(sorted(cfg.items()))


def model_xml(objs, title):
    res, build = [], []
    for i, (name, mesh, (x, y)) in enumerate(objs, 1):
        v = "\n".join(f'     <vertex x="{a:.4f}" y="{b:.4f}" z="{c:.4f}"/>' for a, b, c in mesh.vertices)
        t = "\n".join(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in mesh.faces)
        res.append(f'''  <object id="{i}" type="model" name="{name}">
   <mesh>
    <vertices>
{v}
    </vertices>
    <triangles>
{t}
    </triangles>
   </mesh>
  </object>''')
        build.append(f'  <item objectid="{i}" transform="1 0 0 0 1 0 0 0 1 {x} {y} 0" printable="1"/>')
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
 <metadata name="Application">BambuStudio-{APP_VER}</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Title">{title}</metadata>
 <resources>
{chr(10).join(res)}
 </resources>
 <build>
{chr(10).join(build)}
 </build>
</model>
'''


def model_settings(objs, title, thumb):
    o, inst, asm = [], [], []
    for i, (name, mesh, (x, y)) in enumerate(objs, 1):
        o.append(f'''  <object id="{i}">
    <metadata key="name" value="{name}"/>
    <metadata key="extruder" value="1"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="{name}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="extruder" value="1"/>
      <mesh_stat face_count="{len(mesh.faces)}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>''')
        inst.append(f'''    <model_instance>
      <metadata key="object_id" value="{i}"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="{i}"/>
    </model_instance>''')
        asm.append(f'   <assemble_item object_id="{i}" instance_id="0" transform="1 0 0 0 1 0 0 0 1 {x} {y} 0" offset="0 0 0" />')
    th = '    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>\n' if thumb else ''
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<config>
{chr(10).join(o)}
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="{title}"/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
{th}{chr(10).join(inst)}
  </plate>
  <assemble>
{chr(10).join(asm)}
  </assemble>
</config>
'''


CONTENT_TYPES = '''<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
 <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
 <Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>
 <Default Extension="png" ContentType="image/png"/>
 <Default Extension="config" ContentType="text/xml"/>
</Types>
'''


def rels(thumb):
    t = ('\n <Relationship Target="/Metadata/plate_1.png" Id="rel-2" '
         'Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/thumbnail"/>') if thumb else ''
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
 <Relationship Target="/3D/3dmodel.model" Id="rel-1" Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/>{t}
</Relationships>
'''


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--profils", required=True)
    ap.add_argument("--sortie", required=True)
    ap.add_argument("--nom", required=True)
    ap.add_argument("--miniature")
    ap.add_argument("--reglages", default=json.dumps(PROCESS_OVERRIDES))
    ap.add_argument("--couleur", default=COLOUR, help="couleur du filament, ex. #C12E1F")
    ap.add_argument("pieces", nargs="+")
    a = ap.parse_args()
    objs = []
    for spec in a.pieces:
        path, _, off = spec.partition("@")
        dx, dy = (float(v) for v in off.split(",")) if off else (0.0, 0.0)
        mesh = trimesh.load(path, force="mesh")
        mesh.merge_vertices()
        assert mesh.is_watertight, f"{path} : maillage non étanche"
        lo, hi = mesh.bounds
        mesh.apply_translation([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
        name = os.path.splitext(os.path.basename(path))[0]
        objs.append((name, mesh, (BED_CENTER[0] + dx, BED_CENTER[1] + dy)))
    cfg = build_config(a.profils, json.loads(a.reglages), a.couleur)
    with zipfile.ZipFile(a.sortie, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", rels(a.miniature))
        z.writestr("3D/3dmodel.model", model_xml(objs, a.nom))
        z.writestr("Metadata/project_settings.config", json.dumps(cfg, indent=4, ensure_ascii=False))
        z.writestr("Metadata/model_settings.config", model_settings(objs, a.nom, a.miniature))
        if a.miniature:
            z.write(a.miniature, "Metadata/plate_1.png")
    for name, mesh, pos in objs:
        print(f"  {name}: {len(mesh.faces)} triangles, {np.round(mesh.extents, 1)} mm, centre {pos}")
    print(f"{a.sortie}: {len(cfg)} réglages")


if __name__ == "__main__":
    main()
