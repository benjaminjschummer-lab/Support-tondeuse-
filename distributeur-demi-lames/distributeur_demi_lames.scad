// =====================================================================
//  Distributeur MURAL de demi-lames emballées – usage barbier (v3)
//
//  - Le dos plat se colle au mur (adhésif double face).
//  - Pile de lames à plat, longueur de gauche à droite, pressée par un
//    ressort imprimé ; couvercle coulissant (le ressort ne peut pas le soulever).
//  - Dessous : fond plat avec une longue rainure. Le doigt se pose sous la
//    lame du bas, côté gauche, et glisse vers la droite jusqu'au milieu :
//    la lame sort par la fente du côté droit.
//  Coordonnées : X = gauche -> droite, Y = avant (-) -> mur (+), Z = haut.
// =====================================================================

/* [Demi-lame emballée dans son papier] */
blade_l = 47.0;   // longueur de la lame emballée
blade_w = 14.0;   // largeur de la lame emballée
blade_t = 0.35;   // épaisseur d'une lame emballée
clr_l   = 0.6;    // jeu aux extrémités (par côté)
clr_w   = 0.45;   // jeu avant/arrière (par côté)

/* [Sortie] */
gap     = 1.5 * blade_t;  // fente de sortie à droite : une seule lame passe

/* [Boîte] */
stack_h = 40;     // hauteur de pile utile (≈ 110 lames emballées)
wall_x  = 2.4;    // parois gauche / droite
wall_y  = 3.2;    // parois avant / dos (logent la glissière du couvercle)
floor_t = 1.6;    // épaisseur du fond
ledge   = 1.6;    // appui de la lame de chaque côté de la rainure
slot_r  = 2;      // arrondi des extrémités de la rainure
view_w  = 4;      // fente de visualisation du stock (face gauche)

/* [Ressort presseur imprimé] */
sp_n     = 10;    // nombre d'ondulations
sp_gap   = 5;     // espace entre deux lames du ressort (au repos)
sp_t     = 0.9;   // épaisseur des lames du ressort
sp_plate = 2;     // épaisseur des plaques haut / bas
sp_w     = 46;    // largeur du ressort (selon X)
sp_d     = 12;    // profondeur du ressort (selon Y)

/* [Couvercle coulissant] */
lid_t    = 2.0;   // épaisseur du couvercle
lid_g    = 1.6;   // profondeur de la glissière dans les parois avant/dos
lid_clr  = 0.25;  // jeu dans la glissière
lid_lip  = 1.6;   // lèvre au-dessus de la glissière
lid_tab  = 5;     // languette qui dépasse à droite pour tirer le couvercle

part = "assembly"; // [assembly, body, lid, spring, body_print, spring_print, lid_print]

eps = 0.01;
ch_l = blade_l + 2*clr_l;
ch_w = blade_w + 2*clr_w;
out_l = ch_l + 2*wall_x;
out_w = ch_w + 2*wall_y;
sp_solid = 2*sp_plate + (sp_n - 1)*sp_t + sp_n*0.35;
sp_free  = 2*sp_plate + (sp_n - 1)*sp_t + sp_n*sp_gap;
capacity_h = stack_h + sp_solid;          // du fond au dessous du couvercle
fl_top  = floor_t;                        // niveau de la lame du bas
ch_top  = fl_top + capacity_h;            // dessous du couvercle
g_h     = lid_t + 2*lid_clr;              // hauteur de la glissière
top_z   = ch_top + g_h + lid_lip;
slot_w  = ch_w - 2*ledge;                 // largeur de la rainure du dessous

module body() {
    difference() {
        translate([-out_l/2, -out_w/2, 0]) cube([out_l, out_w, top_z]);
        // réserve de lames
        translate([-ch_l/2, -ch_w/2, fl_top]) cube([ch_l, ch_w, top_z]);
        // glissière du couvercle (avant + dos), ouverte à droite
        translate([-ch_l/2, -ch_w/2 - lid_g, ch_top]) cube([ch_l + wall_x + 1, ch_w + 2*lid_g, g_h]);
        // passage du couvercle à travers la paroi droite
        translate([ch_l/2 - eps, -ch_w/2, ch_top]) cube([wall_x + 1, ch_w, top_z]);
        // fente de sortie à droite : une seule lame
        translate([ch_l/2 - eps, -ch_w/2, fl_top]) cube([wall_x + 1, ch_w, gap]);
        // rainure du dessous pour le doigt, ouverte aussi à gauche
        hull() {
            translate([-out_l/2 - 1, -slot_w/2, -1]) cube([eps, slot_w, floor_t + 1 + eps]);
            translate([ch_l/2 - 2 - slot_r, 0, -1]) scale([1, slot_w/(2*slot_r), 1])
                cylinder(r = slot_r, h = floor_t + 1 + eps, $fn = 32);
        }
        // fente de visualisation du stock (paroi gauche)
        translate([-out_l/2 - 1, -view_w/2, fl_top + 3]) cube([wall_x + 2, view_w, stack_h]);
        // repère gravé sur la face avant : flèche « sortie »
        translate([ch_l/2 - 10, -out_w/2 - eps, fl_top + 8]) rotate([90, 0, 0]) mirror([0, 0, 1])
            linear_extrude(0.6) polygon([[0, -2.5], [6, 0], [0, 2.5]]);
    }
}

module lid() {
    w = ch_w + 2*lid_g - 2*lid_clr;
    l = ch_l + wall_x + lid_tab;
    difference() {
        translate([-ch_l/2 + lid_clr, -w/2, 0]) cube([l - lid_clr, w, lid_t]);
        // chanfrein du bord d'attaque (côté gauche) : il comprime le ressort en glissant
        translate([-ch_l/2 + lid_clr, 0, 0]) rotate([0, 45, 0]) cube([1.4, w + 2, 1.4], center = true);
    }
    // languette de préhension à droite
    translate([ch_l/2 + wall_x + lid_tab - 2, -w/2, 0]) cube([2, w, lid_t + 3]);
}

// --- Ressort presseur : profil 2D en zigzag (X = largeur, Y = hauteur) ---
module spring_profile() {
    p  = sp_gap + sp_t;
    lb = sp_w - p - sp_t;
    square([sp_w, sp_plate]);
    translate([0, sp_plate + sp_n*sp_gap + (sp_n - 1)*sp_t]) square([sp_w, sp_plate]);
    for (i = [1 : sp_n - 1])
        translate([(sp_w - lb)/2, sp_plate + i*sp_gap + (i - 1)*sp_t]) square([lb, sp_t]);
    for (i = [0 : sp_n - 1]) {
        y0 = sp_plate + i*(sp_gap + sp_t) - sp_t/2;
        cy = y0 + p/2;
        right = (i % 2 == 0);
        cx = right ? (sp_w + lb)/2 : (sp_w - lb)/2;
        translate([cx, cy]) intersection() {
            difference() { circle(r = p/2 + sp_t/2, $fn = 48); circle(r = p/2 - sp_t/2, $fn = 48); }
            translate([right ? 0 : -p, -p]) square([p, 2*p]);
        }
    }
}
module spring(h = sp_free) {  // posé sur la pile ; h < sp_free = ressort comprimé (aperçu)
    translate([-sp_w/2, sp_d/2, 0]) rotate([90, 0, 0]) linear_extrude(sp_d)
        scale([1, h/sp_free]) spring_profile();
}

if (part == "body") body();
else if (part == "lid") lid();
else if (part == "spring") spring();
// impression : corps couché sur la face gauche -> fente de sortie précise (plan XY),
// aucune surface en porte-à-faux sauf de petits ponts
else if (part == "body_print") translate([0, 0, out_l/2]) rotate([0, -90, 0]) body();
else if (part == "lid_print") lid();
else if (part == "spring_print") linear_extrude(sp_d) spring_profile();
else {
    body();
    color("orange") translate([0, 0, fl_top + stack_h * 0.5]) spring(ch_top - fl_top - stack_h*0.5);
    color("silver") for (i = [0 : 30]) translate([-blade_l/2 + (i == 0 ? 18 : 0), -blade_w/2, fl_top + i*stack_h*0.5/31]) cube([blade_l, blade_w, stack_h*0.5/31 - 0.1]);
    color([0.3, 0.3, 0.32]) translate([0, 0, ch_top + lid_clr]) lid();
}
