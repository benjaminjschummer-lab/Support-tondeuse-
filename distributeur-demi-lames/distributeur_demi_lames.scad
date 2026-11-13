// =====================================================================
//  Distributeur de demi-lames à gravité – usage barbier
//  Chargement par le haut (couvercle), sortie une à une en bas :
//  on pose le doigt sous la lame du bas (fenêtre) et on la tire vers soi.
//  Fichier paramétrique OpenSCAD – cotes en mm
// =====================================================================

/* [Demi-lame] */
blade_l = 43.0;   // longueur d'une demi-lame (lame DE 43 x 22,2 coupée en deux)
blade_w = 11.1;   // largeur d'une demi-lame
clr_l   = 0.6;    // jeu aux extrémités (par côté)
clr_w   = 0.45;   // jeu avant/arrière (par côté)

/* [Sortie] */
gap     = 0.18;   // hauteur de la fente de sortie : > 1 lame (0,1) et < 2 lames

/* [Corps] */
capacity_h = 40;  // hauteur de la réserve (≈ 400 demi-lames)
wall    = 2.4;
floor_t = 1.4;    // fond sous la pile (le doigt passe par la fenêtre)
floor_z = 24;     // hauteur du fond : place pour le doigt dessous
base_d  = 64;     // profondeur du socle (stabilité)
base_t  = 4;
win_l   = 26;     // fenêtre doigt sous la lame (longueur)
fc_w    = 32;     // largeur de la niche pour le doigt
view_w  = 4;      // fente latérale pour voir le stock

/* [Couvercle] */
lid_clr  = 0.25;
lid_skirt= 8;
lid_top  = 2;

part = "assembly"; // [assembly, body, lid, print, body_print, section]

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
            translate([-out_l/2, -base_d/2, 0]) cube([out_l, base_d, base_t]);
            // goussets avant / arrière (profil constant selon X)
            for (s = [-1, 1])
                rotate([90, 0, 90]) translate([0, 0, -out_l/2])
                    linear_extrude(out_l)
                        polygon([[s*out_w/2, base_t - eps], [s*base_d/2, base_t - eps],
                                 [s*out_w/2, base_t + (base_d - out_w)/2 * 0.9]]);
        }
        // réserve de lames
        translate([-ch_l/2, -ch_w/2, fl_top]) cube([ch_l, ch_w, capacity_h + 1]);
        // fente de sortie à l'avant (une seule lame)
        translate([-ch_l/2, -out_w/2 - 1, fl_top]) cube([ch_l, wall + 2, gap]);
        // dégagement devant la fente pour attraper la lame (avant du fond abaissé)
        translate([-ch_l/2, -base_d/2 - 1, fl_top]) cube([ch_l, base_d/2 - out_w/2 + 1 - eps, 50]);
        // niche pour le doigt sous le fond, ouverte vers l'avant
        translate([-fc_w/2, -base_d/2 - 1, base_t])
            cube([fc_w, base_d/2 + ch_w/2 - 1.2 + 1, floor_z - base_t]);
        // fenêtre dans le fond : le doigt touche la lame du bas
        translate([-win_l/2, -ch_w/2 - eps, floor_z - 1]) cube([win_l, ch_w - 1.6, floor_t + 1 + eps]);
        // fente latérale de visualisation du stock (côté gauche)
        translate([-out_l/2 - 1, -view_w/2, fl_top + 3]) cube([wall + 2, view_w, capacity_h - 6]);
    }
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
else if (part == "body_print") {
    translate([0, 0, out_l/2]) rotate([0, 90, 0]) body();
}
else if (part == "print") {
    // corps couché sur le côté : la fente de sortie est dans le plan XY (précision max)
    translate([0, 0, out_l/2]) rotate([0, 90, 0]) body();
    translate([0, base_d/2 + 20, 0]) lid();
}
else if (part == "section") {
    intersection() { body(); translate([-1, -50, 0]) cube([2, 100, 100]); }
}
else {
    body();
    %translate([0, 0, top_z + lid_top + lid_skirt + 5]) rotate([180, 0, 0]) translate([0,0,0]) lid();
}
