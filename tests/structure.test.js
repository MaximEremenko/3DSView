"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const {loadApp} = require("./harness");
const {assertClose} = require("./fixtures");

// An .rmc6f configuration built from the atoms of each parent cell, in
// supercell fractions, with or without the site and cell columns.
function rmc6fText({supercell, cell, atomsIn, sites=true}){
  const lines = ["(Version 6f format configuration file)", `Supercell dimensions:  ${supercell.join("  ")}`,
    `Cell (Ang/deg):  ${cell.map((v, i) => (i < 3 ? v * supercell[i] : v)).join("  ")}`, "Atoms:"];
  let n = 0;
  for(let i=0;i<supercell[0];i++) for(let j=0;j<supercell[1];j++) for(let k=0;k<supercell[2];k++){
    for(const a of atomsIn(i, j, k)){
      n++;
      const f = a.frac.map((v, q) => (((v + [i, j, k][q]) / supercell[q]) % 1 + 1) % 1);
      lines.push(`${n}  ${a.element} [1]  ${f.map(v => v.toFixed(8)).join("  ")}${sites ? `  ${a.site}  ${i}  ${j}  ${k}` : ""}`);
    }
  }
  return lines.join("\n") + "\n";
}

// A on the cell corner, displaced by +-0.02 so half the atoms sit just below
// 1; B and C share the body centre, B in 3 of the 8 cells.
const corner = (i, j, k) => {
  const s = (i + j + k) % 2 ? 0.02 : -0.02;
  const b = i * 4 + j * 2 + k < 3;
  return [{element:"A", frac:[s, s, s], site:1}, {element:b ? "B" : "C", frac:[0.5, 0.5, 0.5], site:2}];
};

const near = (f, g) => Math.min(Math.abs(f - g), 1 - Math.abs(f - g));

test(".rmc6f atoms average into the parent cell by site", () => {
  const app = loadApp();
  for(const sites of [true, false]){
    const st = app.context.parseRmc6fStructure(rmc6fText({supercell:[2, 2, 2], cell:[4, 4, 4, 90, 90, 90], atomsIn:corner, sites}));
    assert.equal(st.atomCount, 16);
    [4, 4, 4, 90, 90, 90].forEach((v, i) => assertClose(st.cell[i], v, 1e-9, `cell ${i}`));
    const by = Object.fromEntries(st.atoms.map(a => [a.element, a]));
    assert.deepEqual(Object.keys(by).sort(), ["A", "B", "C"], `three entries (site columns: ${sites})`);
    for(let c=0;c<3;c++) assert.ok(near(by.A.frac[c], 0) < 1e-9, "the circular mean keeps the corner site at 0, not 0.5");
    for(let c=0;c<3;c++) assertClose(by.B.frac[c], 0.5, 1e-9, "shared site");
    assertClose(by.A.occupancy, 1, 1e-12);
    assertClose(by.B.occupancy, 3 / 8, 1e-12);
    assertClose(by.C.occupancy, 5 / 8, 1e-12);
    if(sites) assert.equal(by.B.label, "site 2");
  }
});

const NACL_CIF = `data_other
_cell_length_a 1
loop_
_foo
bar
data_NaCl
_cell_length_a    5.6402(3)
_cell_length_b    5.6402(3)
_cell_length_c    5.6402(3)
_cell_angle_alpha 90
_cell_angle_beta  90
_cell_angle_gamma 90.0
_symmetry_space_group_name_H-M 'F m -3 m'
_publ_section_title
;
Rock salt, with only the F-centring operations
;
loop_
_symmetry_equiv_pos_site_id
_symmetry_equiv_pos_as_xyz
1 'x, y, z'
2 'x, y+1/2, z+1/2'
3 'x+1/2, y, z+1/2'
4 "x+1/2, y+1/2, z"
loop_
_atom_site_label
_atom_site_type_symbol
_atom_site_fract_x
_atom_site_fract_y
_atom_site_fract_z
_atom_site_occupancy
Na1 Na+ 0 0 0 1.0  # sodium
Cl1 Cl- 0.5000(2) 0.5 0.5 1
`;

test("a CIF gives its cell and the sites expanded by its operations", () => {
  const app = loadApp();
  const st = app.context.parseCifStructure(NACL_CIF);
  [5.6402, 5.6402, 5.6402, 90, 90, 90].forEach((v, i) => assertClose(st.cell[i], v, 1e-12, `cell ${i}`));
  assert.equal(st.operations, 4);
  assert.equal(st.spaceGroup, "F m -3 m");
  assert.equal(st.atoms.length, 8);
  const cl = Array.from(st.atoms.filter(a => a.element === "Cl"), a => Array.from(a.frac).join(" ")).sort();
  assert.deepEqual(cl, ["0 0 0.5", "0 0.5 0", "0.5 0 0", "0.5 0.5 0.5"]);
  assert.throws(() => app.context.parseCifStructure("data_x\n_cell_length_a 4\n"), /_cell_length/);
});

test("symmetry operations parse into rotation and translation", () => {
  const app = loadApp();
  const op = app.context.parseSymop("-x+1/2, y-x, z+0.25");
  assert.deepEqual(Array.from(op.R, r => Array.from(r)), [[-1, 0, 0], [-1, 1, 0], [0, 0, 1]]);
  assert.deepEqual(Array.from(op.t), [0.5, 0, 0.25]);
  assert.equal(app.context.parseSymop("x, y"), null);
  assert.equal(app.context.parseSymop("x, y, q"), null);
});

test("interatomic vectors of rock salt, by element pair", () => {
  const app = loadApp();
  const vectors = app.context.interatomicVectors(app.context.parseCifStructure(NACL_CIF));
  assert.equal(vectors.length, 12);
  const count = pair => vectors.filter(v => v.pair === pair).length;
  assert.deepEqual([count("Na–Na"), count("Cl–Cl"), count("Cl–Na")], [4, 4, 4]);
});

// A real-space grid from -1 to 1 in steps of 0.25 along each axis.
function pdfGrid(app, kind){
  const ax = Array.from({length:9}, (_, i) => -1 + 0.25 * i);
  const res = app.context.makeVolumeResult("map_dpdf.h5", [9, 9, 9], ax, ax, ax, new Float64Array(729), "test", kind, null, 0,
    {dataKind:{code:"delta_pdf", label:"3D-ΔPDF", source:"test"}});
  app.state.res = res;
  return res;
}

function wholeSlice(app, res, axis, index){
  const sl = app.context.buildAxisSlice(res, axis, index, 1e6, false, 0);
  const cx = (sl.xMax - sl.xMin) / (sl.cols - 1), cy = (sl.yMax - sl.yMin) / (sl.rows - 1);
  return {sl, box:{x0:sl.xMin - cx / 2, x1:sl.xMax + cx / 2, y0:sl.yMin - cy / 2, y1:sl.yMax + cy / 2}};
}

test("vectors in a u, v, w slice: every lattice translation, pairs merged per position", () => {
  const app = loadApp();
  const res = pdfGrid(app, "uvw");
  const st = app.context.parseCifStructure(NACL_CIF);
  const lattice = app.context.vectorLattice(res, st);
  assert.equal(lattice.assumed, false);
  const {sl, box} = wholeSlice(app, res, "l", 4);   // w = 0
  const {spots} = app.context.vectorSpotsInSlice(res, app.context.interatomicVectors(st), lattice.rows, sl, box);
  assert.equal(spots.length, 25, "u and v at every half from -1 to 1");
  const at = (u, v) => spots.find(s => Math.abs(s.uvw[0] - u) < 1e-9 && Math.abs(s.uvw[1] - v) < 1e-9);
  assert.deepEqual(Array.from(at(0.5, 0).pairs), ["Cl–Na"]);
  assert.deepEqual(Array.from(at(0, 0).pairs), ["Cl–Cl", "Na–Na"]);
  assert.deepEqual(Array.from(at(-0.5, 0.5).pairs), ["Cl–Cl", "Na–Na"]);
  const {spots:off} = app.context.vectorSpotsInSlice(res, app.context.interatomicVectors(st), lattice.rows, wholeSlice(app, res, "l", 5).sl, box);
  assert.equal(off.length, 0, "no vector lies at w = 0.25");
});

test("vectors on a Cartesian map take a along x", () => {
  const app = loadApp();
  const ax = Array.from({length:17}, (_, i) => -4 + 0.5 * i);
  const res = app.context.makeVolumeResult("map_xyz.h5", [17, 17, 17], ax, ax, ax, new Float64Array(17 ** 3), "test", "xyz", null, 0,
    {dataKind:{code:"delta_pdf", label:"3D-ΔPDF", source:"test"}});
  app.state.res = res;
  const st = {cell:[3, 3, 5, 90, 90, 120], atoms:[{element:"X", frac:[0, 0, 0], occupancy:1}]};
  const lattice = app.context.vectorLattice(res, st);
  assert.equal(lattice.assumed, true);
  const {sl, box} = wholeSlice(app, res, "l", 8);   // z = 0
  const {spots} = app.context.vectorSpotsInSlice(res, app.context.interatomicVectors(st), lattice.rows, sl, box);
  // Lattice points n1 a + n2 b within |x|, |y| <= 4.25: 3 on the x axis, 2 above and 2 below.
  assert.equal(spots.length, 7);
  const b = spots.find(s => Math.abs(s.uvw[0]) < 1e-9 && Math.abs(s.uvw[1] - 1) < 1e-9);
  const xy = [sl.colAxis, sl.rowAxis];
  const cart = [0, 0, 0];
  cart[xy[0]] = b.xv; cart[xy[1]] = b.yv;
  assertClose(cart[0], -1.5, 1e-9, "b = (a cos 120, a sin 120)");
  assertClose(cart[1], 1.5 * Math.sqrt(3), 1e-9);
});
