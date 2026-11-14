// =====================================================================
//  Distributeur de demi-lames à gravité – usage barbier
//  Chargement par le haut (couvercle), sortie une à une en bas :
//  on pose le doigt sous la lame du bas (fenêtre) et on la tire vers soi.
//  Fichier paramétrique OpenSCAD – cotes en mm
// =====================================================================

/* [Demi-lame emballée dans son papier] */
// Mesure facile : longueur et largeur du papier à la règle,
// épaisseur = hauteur d'une pile de 10 lames emballées / 10.
blade_l = 47.0;   // longueur de la lame emballée (papier compris)
blade_w = 14.0;   // largeur de la lame emballée (papier compris)
blade_t = 0.35;   // épaisseur d'une lame emballée (0,1 lame + 2 x papier)
clr_l   = 0.6;    // jeu aux extrémités (par côté)
clr_w   = 0.45;   // jeu avant/arrière (par côté)

/* [Sortie] */
gap     = 1.5 * blade_t;  // fente de sortie : 1,5 épaisseur -> une seule lame passe

/* [Corps] */
capacity_h = 50;  // hauteur de la réserve (≈ 140 lames emballées, une boîte de 100)
wall    = 2.4;
floor_t = 3;      // fond sous la pile (contient la rainure du tiroir)
floor_z = 18;      // hauteur du fond : place pour le doigt dessous (14 mm)
base_d  = 0;       // profondeur du socle (0 = aussi étroit que la tour, à coller au double face)
base_t  = 4;

/* [Tiroir poussoir] */
// Le tiroir coulisse dans une rainure du fond. Sa dent arrière dépasse du fond
// de moins d'une épaisseur de lame : elle ne pousse que la lame du bas.
tooth_h = 0.20;   // hauteur de la dent au-dessus du fond (< blade_t)
tooth_l = 2.1;    // longueur de la dent
sl_w    = 14;     // largeur du tiroir
sl_l    = 5;      // longueur de la plaque du tiroir
sl_t    = 1.4;    // épaisseur de la plaque
groove_d= 1.6;    // profondeur de la rainure
stroke  = 11;     // course : la lame sort d'environ 7,5 mm
fin_t   = 3;      // épaisseur de l'ailette à tirer
fin_h   = 9;      // longueur de l'ailette sous le fond (dans la niche)
sl_clr  = 0.3;    // jeu latéral du tiroir
fc_w    = 34;     // largeur de la niche pour le doigt
view_w  = 4;      // fente latérale pour voir le stock

/* [Couvercle] */
lid_clr  = 0.25;
lid_skirt= 8;
lid_top  = 2;

part = "assembly"; // [assembly, body, lid, slider, slider_print, print, body_print, section]

eps = 0.01;
ch_l  = blade_l + 2*clr_l;
ch_w  = blade_w + 2*clr_w;
out_l = ch_l + 2*wall;
out_w = ch_w + 2*wall;
fl_top = floor_z + floor_t;           // dessus du fond = niveau de la lame du bas
top_z  = fl_top + capacity_h;

module body() {
    difference() {
        union() {
            translate([-out_l/2, -out_w/2, 0]) cube([out_l, out_w, top_z]);
            if (base_d > out_w) {
            translate([-out_l/2, -base_d/2, 0]) cube([out_l, base_d, base_t]);
            // goussets avant / arrière (profil constant selon X)
            for (s = [-1, 1])
                rotate([90, 0, 90]) translate([0, 0, -out_l/2])
                    linear_extrude(out_l)
                        polygon([[s*out_w/2, base_t - eps], [s*base_d/2, base_t - eps],
                                 [s*out_w/2, base_t + (base_d - out_w)/2 * 0.9]]);
            }
        }
        // réserve de lames
        translate([-ch_l/2, -ch_w/2, fl_top]) cube([ch_l, ch_w, capacity_h + 1]);
        // fente de sortie à l'avant (une seule lame)
        translate([-ch_l/2, -out_w/2 - 1, fl_top]) cube([ch_l, wall + 2, gap]);
        // dégagement devant la fente pour attraper la lame (avant du fond abaissé)
        translate([-ch_l/2, -max(base_d, out_w)/2 - 1, fl_top]) cube([ch_l, max(base_d, out_w)/2 - out_w/2 + 1 - eps, 50]);
        // niche pour le doigt sous le fond, ouverte vers l'avant
        translate([-fc_w/2, -max(base_d, out_w)/2 - 1, base_t])
            cube([fc_w, max(base_d, out_w)/2 + ch_w/2 + 1 + 1, floor_z - base_t]);
        // rainure du tiroir (traverse la paroi arrière pour loger la dent au repos)
        translate([-(sl_w/2 + sl_clr), -ch_w/2, fl_top - groove_d])
            cube([sl_w + 2*sl_clr, out_w, groove_d + eps]);
        // logement de la dent dans la paroi arrière
        translate([-(sl_w/2 + sl_clr), ch_w/2 - eps, fl_top - eps])
            cube([sl_w + 2*sl_clr, wall + 1, tooth_h + 0.25]);
        // fente de l'ailette à travers le fond (limite la course)
        translate([-(sl_w/2 + sl_clr), fin_y0() - stroke - 0.3, floor_z - 1])
            cube([sl_w + 2*sl_clr, fin_t + stroke + 0.6, floor_t - groove_d + 1 + eps]);
        // fente latérale de visualisation du stock (côté gauche)
        translate([-out_l/2 - 1, -view_w/2, fl_top + 3]) cube([wall + 2, view_w, capacity_h - 6]);
    }
}

// --- Tiroir poussoir (coordonnées d'usage, position repos) ---
function sl_y1() = ch_w/2 + tooth_l + 0.1;     // arrière du tiroir (dans la paroi)
function sl_y0() = sl_y1() - sl_l;             // avant de la plaque
function fin_y0() = sl_y0() + 0.8;             // avant de l'ailette

module slider_profile() {   // profil dans le plan (Y, Z), extrudé sur la largeur
    // plaque (dessus 0,05 sous le niveau du fond)
    translate([sl_y0(), fl_top - 0.05 - sl_t]) square([sl_l, sl_t]);
    // dent arrière
    translate([sl_y1() - tooth_l, fl_top - 0.05]) square([tooth_l, tooth_h + 0.05]);
    // ailette qui descend dans la niche
    translate([fin_y0(), floor_z - fin_h]) square([fin_t, fl_top - 0.05 - sl_t - floor_z + fin_h + 0.01]);
}
module slider() {
    rotate([90, 0, 90]) translate([0, 0, -sl_w/2]) linear_extrude(sl_w) slider_profile();
}

module lid() {
    il = out_l + 2*lid_clr;
    iw = out_w + 2*lid_clr;
    difference() {
        translate([-il/2 - 2, -iw/2 - 2, 0]) cube([il + 4, iw + 4, lid_top + lid_skirt]);
        translate([-il/2, -iw/2, lid_top]) cube([il, iw, lid_skirt + 1]);
    }
    // ergot de maintien (petite bosse à friction) sur les grands côtés
    for (s = [-1, 1])
        translate([-6, s*(iw/2) - (s > 0 ? 0.35 : 0), lid_top + lid_skirt - 3]) cube([12, 0.35, 2]);
}

if (part == "body") body();
else if (part == "lid") lid();
else if (part == "slider") slider();
else if (part == "slider_print") linear_extrude(sl_w) slider_profile();   // à plat sur le profil : dent précise en XY
else if (part == "body_print") {
    translate([0, 0, out_l/2]) rotate([0, 90, 0]) body();
}
else if (part == "print") {
    // corps couché sur le côté : la fente de sortie est dans le plan XY (précision max)
    translate([0, 0, out_l/2]) rotate([0, 90, 0]) body();
    translate([0, max(base_d, out_w)/2 + 20, 0]) lid();
}
else if (part == "section") {
    intersection() { body(); translate([-1, -50, 0]) cube([2, 100, 100]); }
}
else {
    body();
    color("orange") slider();
    %translate([0, 0, top_z + lid_top + lid_skirt + 5]) rotate([180, 0, 0]) translate([0,0,0]) lid();
}
