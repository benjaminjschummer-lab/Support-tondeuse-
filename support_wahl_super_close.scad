// =====================================================================
//  Support de charge vertical - Wahl Super Close (3616-0470)
//  Dimensions appareil (l x H x P) : 58 x 108 x 26 mm
//  Fichier paramétrique OpenSCAD - toutes les cotes sont en mm
// =====================================================================

/* [Appareil] */
dev_w      = 58;    // largeur (l)
dev_d      = 26;    // profondeur / épaisseur (P)
dev_h      = 108;   // hauteur (H) - info seulement
dev_r      = 9;     // rayon des arêtes verticales de l'appareil
clearance  = 0.8;   // jeu autour de l'appareil (par côté)

/* [Berceau] */
wall        = 3.2;  // épaisseur des parois du berceau
pocket_back = 40;   // hauteur de la paroi arrière au-dessus du fond
pocket_side = 32;   // hauteur des parois latérales
pocket_front= 7;    // hauteur de la paroi avant (bas pour voir le témoin de charge F)
front_cut_w = 36;   // largeur de l'échancrure avant

/* [Socle] */
base_w   = 96;      // largeur du socle
base_d   = 72;      // profondeur du socle
base_h   = 24;      // hauteur du socle (loge la fiche + le rayon du câble)
base_r   = 12;      // rayon des coins du socle
chamfer  = 3;       // chanfrein de l'arête supérieure
floor_t  = 4;       // épaisseur du fond de la poche (tient la fiche)
cradle_y = 4;       // décalage du berceau vers l'arrière (+) / avant (-)

/* [Charge] */
// La prise de l'appareil (G) est au centre du dessous (notice Wahl type 3616).
// "bottom" : la fiche d'origine (I) est encastrée verticalement dans le fond
// "cable"  : simple fente arrière, la fiche reste libre
charge_mode = "bottom"; // [bottom, cable]
plug_w   = 12.0;    // largeur du corps plastique de la fiche (I) - MESURER
plug_t   = 7.0;     // épaisseur du corps plastique de la fiche (I) - MESURER
plug_clr = 0.3;     // jeu autour de la fiche (elle est ensuite collée)
port_dx  = 0;       // décalage du port par rapport au centre (largeur)
port_dy  = 0;       // décalage du port par rapport au centre (épaisseur)
cable_d  = 5;       // diamètre du passage de câble
rear_slot_w = 8;    // largeur de la fente arrière (mode "cable")

/* [Pieds] */
feet     = true;    // logements pour patins caoutchouc
foot_d   = 10.5;
foot_t   = 1.2;

$fn = 64;
eps = 0.01;

pk_w = dev_w + 2*clearance;
pk_d = dev_d + 2*clearance;
pk_r = dev_r + clearance;
cr_w = pk_w + 2*wall;
cr_d = pk_d + 2*wall;
cr_r = pk_r + wall;
cr_h = pocket_back + floor_t;   // hauteur du berceau depuis le haut du socle - floor
z_floor = base_h;               // fond de la poche = haut du socle

module rrect(w, d, r, h) {
    linear_extrude(h)
        offset(r = r) square([w - 2*r, d - 2*r], center = true);
}

module base() {
    hull() {
        rrect(base_w, base_d, base_r, base_h - chamfer);
        translate([0, 0, base_h - chamfer])
            rrect(base_w - 2*chamfer, base_d - 2*chamfer, base_r - chamfer, chamfer);
    }
}

module cradle_outer() {
    translate([0, cradle_y, base_h - eps]) {
        // paroi pleine jusqu'à la hauteur de la paroi arrière, arrondie en haut
        hull() {
            rrect(cr_w, cr_d, cr_r, pocket_back - wall/2);
            translate([0, 0, pocket_back - wall/2])
                rrect(cr_w - wall, cr_d - wall, cr_r - wall/2, wall/2);
        }
        // congé de raccord avec le socle
        hull() {
            rrect(cr_w + 8, cr_d + 8, cr_r + 4, eps);
            rrect(cr_w, cr_d, cr_r, 4);
        }
    }
}

module cradle_cuts() {
    translate([0, cradle_y, 0]) {
        // poche
        translate([0, 0, z_floor]) rrect(pk_w, pk_d, pk_r, pocket_back + 10);
        // chanfrein d'entrée de la poche
        translate([0, 0, z_floor + pocket_back - 2])
            hull() {
                rrect(pk_w, pk_d, pk_r, eps);
                translate([0, 0, 2.5]) rrect(pk_w + 3, pk_d + 3, pk_r + 1.5, eps);
            }
        // parois latérales abaissées (profil en pente vers l'avant)
        side_cut();
        // échancrure avant arrondie
        translate([0, -cr_d/2 - 1, z_floor + pocket_front + front_cut_w/2])
            rotate([-90, 0, 0])
                hull() {
                    cylinder(d = front_cut_w, h = wall + 2);
                    translate([0, -60, 0]) cylinder(d = front_cut_w, h = wall + 2);
                }
    }
}

module side_cut() {
    // enlève la matière au-dessus d'un plan incliné: avant = pocket_front, arrière = pocket_back
    // les côtés restent à pocket_side au centre
    translate([0, 0, z_floor])
        hull() {
            translate([-cr_w, -cr_d/2 - 1, pocket_front + 10]) cube([2*cr_w, eps, 80]);
            translate([-cr_w, -eps/2, pocket_side]) cube([2*cr_w, eps, 80]);
        }
    translate([0, 0, z_floor])
        hull() {
            translate([-cr_w, -eps/2, pocket_side]) cube([2*cr_w, eps, 80]);
            translate([-cr_w, cr_d/2 - wall - 1, pocket_back]) cube([2*cr_w, eps, 80]);
        }
}

module charge_cuts() {
    px = port_dx;
    py = cradle_y + port_dy;
    if (charge_mode == "bottom") {
        // logement de la fiche d'origine traversant le fond
        translate([px, py, z_floor - floor_t - 1])
            linear_extrude(floor_t + 2)
                offset(r = 1) square([plug_w + 2*plug_clr - 2, plug_t + 2*plug_clr - 2], center = true);
        // chambre sous le fond : laisse le câble se courber vers l'arrière
        hull() {
            translate([px, py, -eps])
                linear_extrude(z_floor - floor_t)
                    offset(r = 1.5) square([plug_w - 1, plug_t - 1], center = true);
            translate([px, py + 16, -eps])
                linear_extrude(cable_d + 2)
                    offset(r = 1.5) square([plug_w - 1, plug_t - 1], center = true);
        }
        // rainure sous le socle jusqu'à l'arrière
        cable_groove(px, py);
    } else {
        // fente verticale dans la paroi arrière + rainure
        translate([px - rear_slot_w/2, cradle_y + pk_d/2 - 1, z_floor - 0.01])
            cube([rear_slot_w, wall + 10, pocket_back + 10]);
        // passage sous le socle
        translate([px - rear_slot_w/2, cradle_y + pk_d/2 - 1, -eps])
            cube([rear_slot_w, wall + 2, z_floor + 1]);
        cable_groove(px, cradle_y + pk_d/2);
    }
}

module cable_groove(px, py) {
    translate([px - cable_d/2, py, -eps])
        cube([cable_d, base_d, cable_d + 0.5]);
    // entrée évasée à l'arrière
    translate([px, base_d/2, -eps])
        linear_extrude(cable_d + 0.5)
            polygon([[-cable_d/2 - 3, 0.5], [cable_d/2 + 3, 0.5],
                     [cable_d/2, -4], [-cable_d/2, -4]]);
}

module feet_cuts() {
    if (feet)
        for (sx = [-1, 1], sy = [-1, 1])
            translate([sx * (base_w/2 - base_r), sy * (base_d/2 - base_r), -eps])
                cylinder(d = foot_d, h = foot_t + eps);
}

module stand() {
    difference() {
        union() { base(); cradle_outer(); }
        cradle_cuts();
        charge_cuts();
        feet_cuts();
    }
}

// Aperçu de l'appareil (F5 uniquement, mettre show_device = true)
show_device = false;
stand();
if (show_device && $preview)
    %translate([0, cradle_y, z_floor + 0.5]) rrect(dev_w, dev_d, dev_r, dev_h);
