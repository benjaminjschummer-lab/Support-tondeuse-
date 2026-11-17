// Supports type Arrma ARAC3109 / AR320413 - reproduction paramétrique (dimensions estimées d'après photo)
// Unités : mm. Modifier les paramètres puis F6 + export STL.
$fn = 96;

// ---- Paramètres communs ----
depth      = 16;   // profondeur du bloc (avant -> arrière)
tab_len    = 9;    // longueur de la patte arrière
tab_th     = 3;    // épaisseur de la patte
tab_w      = 11;   // largeur de la patte centrale
hole_d     = 3.2;  // trou de fixation (vis M3)
ear_w      = 6;    // largeur des oreilles latérales
ear_len    = 4;    // débord des oreilles
groove_d   = 0.6;  // profondeur des rainures décoratives
edge_r     = 1;    // arrondi des arêtes verticales

module rbox(size, r) {               // cube aux arêtes verticales arrondies
    hull() for (x=[r, size[0]-r], y=[r, size[1]-r])
        translate([x, y, 0]) cylinder(r=r, h=size[2]);
}

module support(L, H, R, floor_h) {
    difference() {
        union() {
            rbox([L, depth, H], edge_r);
            // patte centrale arrière avec trou
            translate([L/2, depth, H - tab_th]) hull() {
                translate([-tab_w/2, -1, 0]) cube([tab_w, 1, tab_th]);
                translate([0, tab_len - tab_w/2, 0]) cylinder(d=tab_w, h=tab_th);
            }
            // oreilles latérales arrière
            for (x = [0, L - ear_w])
                translate([x, depth - 1, H - tab_th - 2])
                    hull() {
                        cube([ear_w, 1, tab_th + 2]);
                        translate([0.8, ear_len, 2]) cube([ear_w - 1.6, 0.01, tab_th]);
                    }
        }
        // berceau arrondi (cylindre vertical sur la face avant)
        translate([L/2, 0, floor_h]) cylinder(r=R, h=H);
        // trou de fixation
        translate([L/2, depth + tab_len - tab_w/2, H - tab_th - 1]) cylinder(d=hole_d, h=tab_th + 2);
        // rainures décoratives sur le dessus
        for (y = [depth - 3.5, depth - 1.8])
            translate([1.5, y, H - groove_d]) cube([L - 3, 0.8, 1]);
        // fentes entre oreilles et patte
        for (x = [ear_w + 0.5, L - ear_w - 1.5])
            translate([x, depth - 2, H - tab_th - 3]) cube([1, 3, tab_th + 4]);
    }
}

// Grand support
support(L = 40, H = 20, R = 13, floor_h = 6);
// Petit support
translate([0, -30, 0]) support(L = 26, H = 17, R = 8.5, floor_h = 5);
