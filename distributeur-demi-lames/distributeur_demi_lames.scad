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
stack_h    = 40;  // hauteur de pile utile (≈ 110 lames emballées, une boîte de 100)
wall    = 2.4;
floor_t = 1.4;    // fond sous la pile (le doigt passe par la fenêtre)
floor_z = 18;      // hauteur du fond : place pour le doigt dessous (14 mm)
base_d  = 0;       // profondeur du socle (0 = aussi étroit que la tour, à coller au double face)
base_t  = 4;
win_l   = 28;     // fenêtre doigt sous la lame (longueur)
fc_w    = 34;     // largeur de la niche pour le doigt
view_w  = 4;      // fente latérale pour voir le stock

/* [Ressort presseur imprimé] */
// Ressort en zigzag (une seule pièce) : plaque du bas = presseur sur la pile,
// plaque du haut = appui sous le couvercle. Imprimé à plat sur le côté.
sp_n     = 10;    // nombre d'ondulations
sp_gap   = 5;     // espace libre entre deux lames du ressort (au repos)
sp_t     = 0.9;   // épaisseur des lames du ressort (2 lignes de buse)
sp_plate = 2;     // épaisseur des plaques haut / bas
sp_w     = 46;    // largeur du ressort
sp_d     = 12;    // profondeur du ressort
sp_solid = 2*sp_plate + (sp_n - 1)*sp_t + sp_n*0.35;     // hauteur écrasé
sp_free  = 2*sp_plate + (sp_n - 1)*sp_t + sp_n*sp_gap;   // hauteur au repos
capacity_h = stack_h + sp_solid;                          // hauteur de la réserve

/* [Couvercle clipsé] */
lid_clr  = 0.25;
lid_skirt= 8;
lid_top  = 2;
lid_wall = 1.6;   // jupe fine pour qu'elle se déforme au clipsage
clip_d   = 5;     // distance du clip sous le haut de la tour
clip_h   = 0.5;   // saillie du clip
clip_len = 30;    // longueur du clip

part = "assembly"; // [assembly, body, lid, spring, spring_print, print, body_print, section]

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
            cube([fc_w, max(base_d, out_w)/2 + ch_w/2 - 1.2 + 1, floor_z - base_t]);
        // fenêtre dans le fond, ouverte vers l'avant (pas de rebord où le doigt accroche)
        translate([-win_l/2, -out_w/2 - 1, floor_z - 1]) cube([win_l, out_w/2 + ch_w/2 - 1.6 + 1, floor_t + 1 + eps]);
        // rainures de clipsage du couvercle (faces avant et arrière)
        for (s = [-1, 1])
            translate([0, s*out_w/2, top_z - clip_d]) clip_shape(clip_len + 4, clip_h + 0.3, 1.6 + 0.6);
        // chanfrein d'entrée en haut de la tour (guide le couvercle)
        for (s = [-1, 1])
            translate([0, s*out_w/2, top_z]) rotate([s*45, 0, 0]) cube([out_l + 2, 1.0, 1.0], center = true);
        // fente latérale de visualisation du stock (côté gauche)
        translate([-out_l/2 - 1, -view_w/2, fl_top + 3]) cube([wall + 2, view_w, capacity_h - 6]);
    }
}

// profil triangulaire (clip / rainure) le long de X, centré en (0, 0, 0)
module clip_shape(len, depth, height) {
    rotate([90, 0, 90]) linear_extrude(len, center = true)
        polygon([[-depth, 0], [depth, 0], [0, height/2], [-depth, 0], [0, -height/2], [depth, 0]]);
}
module lid() {
    il = out_l + 2*lid_clr;
    iw = out_w + 2*lid_clr;
    difference() {
        translate([-il/2 - lid_wall, -iw/2 - lid_wall, 0]) cube([il + 2*lid_wall, iw + 2*lid_wall, lid_top + lid_skirt]);
        translate([-il/2, -iw/2, lid_top]) cube([il, iw, lid_skirt + 1]);
        // chanfrein d'entrée de la jupe
        for (s = [-1, 1])
            translate([0, s*iw/2, lid_top + lid_skirt]) rotate([s*45, 0, 0]) cube([il + 4, 1.2, 1.2], center = true);
    }
    // clips : nervures qui s'enclenchent dans les rainures de la tour
    for (s = [-1, 1])
        intersection() {
            translate([0, s*iw/2, lid_top + clip_d]) clip_shape(clip_len, clip_h, 1.6);
            translate([-il/2, -iw/2, lid_top]) cube([il, iw, lid_skirt]);
        }
}

// --- Ressort presseur : profil 2D en zigzag (X = largeur, Y = hauteur) ---
module spring_profile() {
    p  = sp_gap + sp_t;                 // pas entre axes des lames
    lb = sp_w - p - sp_t;               // longueur droite des lames
    // plaques haut et bas
    square([sp_w, sp_plate]);
    translate([0, sp_plate + sp_n*sp_gap + (sp_n - 1)*sp_t]) square([sp_w, sp_plate]);
    // lames intermédiaires
    for (i = [1 : sp_n - 1])
        translate([(sp_w - lb)/2, sp_plate + i*sp_gap + (i - 1)*sp_t]) square([lb, sp_t]);
    // boucles alternées gauche / droite reliant les lames
    for (i = [0 : sp_n - 1]) {
        y0 = sp_plate + i*(sp_gap + sp_t) - sp_t/2;      // axe de la lame du dessous
        cy = y0 + p/2;
        right = (i % 2 == 0);
        cx = right ? (sp_w + lb)/2 : (sp_w - lb)/2;
        translate([cx, cy]) intersection() {
            difference() { circle(r = p/2 + sp_t/2, $fn = 48); circle(r = p/2 - sp_t/2, $fn = 48); }
            translate([right ? 0 : -p, -p]) square([p, 2*p]);
        }
    }
}
module spring() {  // position d'usage : posé sur la pile
    translate([-sp_w/2, sp_d/2, 0]) rotate([90, 0, 0]) linear_extrude(sp_d) spring_profile();
}

if (part == "body") body();
else if (part == "lid") lid();
else if (part == "spring") spring();
else if (part == "spring_print") linear_extrude(sp_d) spring_profile();
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
    color("orange") translate([0, 0, fl_top + 15]) spring();
    %translate([0, 0, top_z + lid_top + 25]) rotate([180, 0, 0]) lid();
}
