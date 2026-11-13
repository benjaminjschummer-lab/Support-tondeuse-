#!/usr/bin/env python3
"""Génère un projet Bambu Studio (.3mf) prêt à imprimer pour la Bambu Lab A1.

- Profils officiels Bambu (dépôt bambulab/BambuStudio, resources/profiles/BBL)
  entièrement résolus (héritage + includes) : imprimante « Bambu Lab A1 0.4 nozzle »,
  qualité « 0.20mm Standard @BBL A1 », filament « Bambu PLA Basic @BBL A1 » noir.
- Pièce posée au centre du plateau, sans supports.

Usage : python3 generer_projet_bambu.py <dossier_profils_BBL> <fichier.stl> <sortie.3mf> [miniature.png]
"""
import json, sys, os, zipfile, uuid
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


def build_config(root):
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
    for k, v in PROCESS_OVERRIDES.items():

        cfg[k] = v
    cfg.update({
        "filament_colour": [COLOUR],
        "filament_ids": [filament.get("filament_id", "GFA00")],
        "filament_settings_id": [FILAMENT],
        "print_settings_id": PROCESS,
        "printer_settings_id": PRINTER,
        "curr_bed_type": "Textured PEI Plate",
        "different_settings_to_system": [";".join(sorted(PROCESS_OVERRIDES)), "", ""],
        "inherits_group": [PROCESS, FILAMENT, PRINTER],
        "from": "project",
        "name": "project_settings",
        "inherits": "",
        "version": APP_VER,
    })
    return dict(sorted(cfg.items()))


def model_xml(mesh, name):
    v = "\n".join(f'     <vertex x="{x:.4f}" y="{y:.4f}" z="{z:.4f}"/>' for x, y, z in mesh.vertices)
    t = "\n".join(f'     <triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in mesh.faces)
    bx, by = BED_CENTER
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02" xmlns:BambuStudio="http://schemas.bambulab.com/package/2021">
 <metadata name="Application">BambuStudio-{APP_VER}</metadata>
 <metadata name="BambuStudio:3mfVersion">1</metadata>
 <metadata name="Title">{name}</metadata>
 <resources>
  <object id="1" type="model" name="{name}">
   <mesh>
    <vertices>
{v}
    </vertices>
    <triangles>
{t}
    </triangles>
   </mesh>
  </object>
 </resources>
 <build>
  <item objectid="1" transform="1 0 0 0 1 0 0 0 1 {bx} {by} 0" printable="1"/>
 </build>
</model>
'''


def model_settings(name, nfaces, thumb):
    bx, by = BED_CENTER
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<config>
  <object id="1">
    <metadata key="name" value="{name}"/>
    <metadata key="extruder" value="1"/>
    <part id="1" subtype="normal_part">
      <metadata key="name" value="{name}"/>
      <metadata key="matrix" value="1 0 0 0 0 1 0 0 0 0 1 0 0 0 0 1"/>
      <metadata key="extruder" value="1"/>
      <mesh_stat face_count="{nfaces}" edges_fixed="0" degenerate_facets="0" facets_removed="0" facets_reversed="0" backwards_edges="0"/>
    </part>
  </object>
  <plate>
    <metadata key="plater_id" value="1"/>
    <metadata key="plater_name" value="Support Wahl"/>
    <metadata key="locked" value="false"/>
    <metadata key="filament_map_mode" value="Auto For Flush"/>
{'    <metadata key="thumbnail_file" value="Metadata/plate_1.png"/>' if thumb else ''}
    <model_instance>
      <metadata key="object_id" value="1"/>
      <metadata key="instance_id" value="0"/>
      <metadata key="identify_id" value="1"/>
    </model_instance>
  </plate>
  <assemble>
   <assemble_item object_id="1" instance_id="0" transform="1 0 0 0 1 0 0 0 1 {bx} {by} 0" offset="0 0 0" />
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
    root, stl, out = sys.argv[1:4]
    thumb = sys.argv[4] if len(sys.argv) > 4 else None
    mesh = trimesh.load(stl, force="mesh")
    mesh.merge_vertices()
    assert mesh.is_watertight, "maillage non étanche"
    lo, hi = mesh.bounds
    mesh.apply_translation([-(lo[0] + hi[0]) / 2, -(lo[1] + hi[1]) / 2, -lo[2]])
    name = "Support Wahl Super Close"
    cfg = build_config(root)
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", CONTENT_TYPES)
        z.writestr("_rels/.rels", rels(thumb))
        z.writestr("3D/3dmodel.model", model_xml(mesh, name))
        z.writestr("Metadata/project_settings.config", json.dumps(cfg, indent=4, ensure_ascii=False))
        z.writestr("Metadata/model_settings.config", model_settings(name, len(mesh.faces), thumb))
        if thumb:
            z.write(thumb, "Metadata/plate_1.png")
    print(f"{out}: {len(mesh.faces)} triangles, {len(cfg)} réglages, dimensions {np.round(mesh.extents,1)}")


if __name__ == "__main__":
    main()
