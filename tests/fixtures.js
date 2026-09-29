"use strict";
// Synthetic data shared by the loader tests.
const assert = require("node:assert/strict");
const {valueAt} = require("./harness");

// Distinct, asymmetric values so any axis permutation is detectable.
const code = (i, j, k) => 1 + i + 10 * j + 100 * k;

// RMCProfile indexed rows "i j k" + one coordinate triplet per symmetry
// section + intensity (or Re Im when amplitude(i,j,k) is given), 1-based,
// i fastest, with an "npoints nsec" header unless header is false.
function indexedText(shape, coord, value=code, {header=true, sections=1, amplitude=null}={}){
  const [nh, nk, nl] = shape;
  const lines = header ? [`${nh * nk * nl} ${sections}`] : [];
  for(let k=0;k<nl;k++) for(let j=0;j<nk;j++) for(let i=0;i<nh;i++){
    const c = coord(i, j, k);
    const triplets = [];
    for(let s=0;s<sections;s++) triplets.push(...c.map(v => (s % 2 ? -v : v).toFixed(7)));
    const tail = amplitude ? amplitude(i, j, k).map(v => v.toExponential(7)).join(" ") : value(i, j, k).toExponential(7);
    lines.push(`${i + 1} ${j + 1} ${k + 1} ${triplets.join(" ")} ${tail}`);
  }
  return lines.join("\n") + "\n";
}

// Flat values for a logical [n0,n1,n2] grid, last index fastest (C order).
function cOrderValues(shape, value=code){
  const out = new Float64Array(shape[0] * shape[1] * shape[2]);
  let p = 0;
  for(let i=0;i<shape[0];i++) for(let j=0;j<shape[1];j++) for(let k=0;k<shape[2];k++) out[p++] = value(i, j, k);
  return out;
}

// Flat values for a logical [n0,n1,n2] grid, first index fastest (Fortran order).
function fortranOrderValues(shape, value=code){
  const out = new Float64Array(shape[0] * shape[1] * shape[2]);
  let p = 0;
  for(let k=0;k<shape[2];k++) for(let j=0;j<shape[1];j++) for(let i=0;i<shape[0];i++) out[p++] = value(i, j, k);
  return out;
}

function assertValues(res, shape, value=code){
  // Arrays built inside the vm context have another realm's prototype.
  assert.deepEqual(Array.from(res.shape), shape);
  for(let i=0;i<shape[0];i++) for(let j=0;j<shape[1];j++) for(let k=0;k<shape[2];k++){
    assert.equal(valueAt(res, i, j, k), value(i, j, k), `value at ${i},${j},${k}`);
  }
}

function assertClose(actual, expected, tol=1e-9, message=""){
  assert.ok(Math.abs(actual - expected) <= tol, `${message} expected ${expected}, got ${actual}`);
}

module.exports = {code, indexedText, cOrderValues, fortranOrderValues, assertValues, assertClose};
