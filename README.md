# 3DSView

**Live tool:** https://maximeremenko.github.io/3DSView/

A browser-based viewer — formerly the 3DS Plotter — for slicing through 3-D diffuse-scattering volumes produced by
RMCProfile and related programs. The application is a single HTML file
(`index.html`) plus local helper scripts in `js/` (the unified HDF5 helper and the
vendored HDF5 engine), and it runs fully client-side: files are parsed in the
browser, nothing is uploaded anywhere. It loads RMCProfile 3DS text output, unified HDF5 volumes,
DISCUS/Yell HDF5 and generic NeXus files, and provides interactive axis, arbitrary-plane
and slab-average slicing with linked 2-D and 3-D views.

## Features

- **Three linked views**: a 3-D rendering of the current slice plane, a 3-D isosurface of
  the whole volume (both Plotly), and a 2-D slice heatmap drawn on a canvas with live
  statistics.
- **Cursor readout**: hovering over the 2-D map shows the coordinates under the cursor
  (H K L, Q or X Y Z), plus Q, |Q| and the d-spacing when a reciprocal basis is known,
  and the value. On axis slices the value is the voxel itself, at full resolution; on
  plane and slab slices it is the value drawn there.
- **2-D zoom and pan**: zoom the map with the mouse wheel (about the cursor) or the +/−
  buttons, and drag to pan; double-click or ↺ shows the whole slice again. Ticks follow
  the visible region, skewed grids keep their shape, and each cell is centred on its
  sample.
- **Three slice modes**:
  - *Axis*: fix H, K or L and step through the volume with an index slider.
  - *Normal plane*: define an arbitrary plane by its normal and origin in HKL/Q space,
    move it along the normal, and control the interpolation resolution and plane extent.
  - *Volume average*: average a slab of adjustable half-width and sample count around the
    plane.
- **Coordinate handling**: Q and HKL (r.l.u.) axes are auto-detected from file names and
  metadata, with a manual override (Auto / Use Q / Use HKL). When a unit cell is known,
  HKL data is transformed to Q through the reciprocal basis; without one, the override
  only relabels the axes. A Mantid UB matrix is read as Q = 2π·UB·h. Real-space volumes
  (delta-PDF / 3D-PDF, scattering density) are recognized and shown with X/Y/Z or U/V/W
  axes.
- **Unit-cell override**: enter a, b, c, alpha, beta, gamma to apply a cell for
  cell-aware axes, or restore the cell read from the file. For Q-space data (RMCProfile
  old text, Scatty VTK, unified files with Q axes) the cell converts the Cartesian Q
  grid to HKL, using the RMCProfile/Scatty frame (a along x, b in the xy-plane); Q stays
  available through the reciprocal basis, and **Restore File Cell** undoes the conversion.
  **Cell from structure file** takes the parent cell from an `.rmc6f` configuration (the
  supercell cell divided by the supercell dimensions) or from a unified structure `.h5`,
  and applies it.
- **Shown-volume limits**: crop the displayed volume per axis with dual-range sliders.
- **Display controls**:
  - **Scales:** log10(value+1), log10, linear and signed-sqrt.
  - **Colour maps:** sequential Viridis, Plasma, Inferno, Magma, Cividis, Turbo and Gray,
    plus diverging RdBu and Coolwarm for signed data. Any map can be reversed, and empty
    voxels can be drawn transparent, gray, white or black.
  - **Levels:** slice-auto, global-auto or manual. Auto levels take a percentile window,
    0.5–99.5 % by default, so Bragg peaks do not wash out the diffuse signal. They can be
    made symmetric about 0, and the colour-bar handles can be dragged on the 2-D map.
  - **Histogram:** a histogram of the shown slice marks the display window.
  - **Signed data:** real-space volumes (delta-PDF, Patterson, density) open on a linear
    scale with RdBu and symmetric levels.
- **No-data masks**: voxels without data are shown empty and left out of levels and
  isosurfaces. That covers NaN values, a Mantid `mask`, and I = 0 in RMCProfile text,
  which RMCProfile uses for "no data". The zero mask switches on automatically when at
  least 1 % of values are zero and can be toggled with **Treat 0 as no data**. Exports
  keep the original zeros.
- **3-D render controls**: isosurface percentile and surface count, voxel cap,
  auto-refresh toggle, independent show/hide for the plane and isosurface views. The
  camera is preserved across slice updates, with zoom and reset buttons on each panel.
- **Large-file handling**: text files larger than 64 MB are streamed line-by-line.
  Regularly ordered indexed files are streamed single-threaded at any size; indexed
  files whose row order cannot be streamed directly are, at 192 MB or more, parsed in
  parallel Web Workers (up to 8). Parsed volumes are cached in IndexedDB so reloading
  the same file is nearly instant.
- **Export**: PNG of the 2-D slice, CSV of the slice values, the shown (cropped) volume
  as a unified HDF5 file (`*_unified.h5`, written in the browser via `js/unified_hdf5.js`
  and h5wasm; the experiment type is kept from the source file, and the cell is derived
  from the reciprocal basis when only a basis is known), SVG snapshots of either 3-D
  plot, and standalone interactive HTML copies of either 3-D plot.

## Supported formats

Text formats (`.dat`, `.txt`, `.csv`) — comment lines starting with `#`, `!` or `;` and
Fortran `D` exponents are handled:

- **RMCProfile 3DS indexed text**: rows of `i j k`, one coordinate triplet per symmetry
  section, then the intensity, with an optional `points sections scale offset` header.
  Rows that end in a real/imaginary pair instead (5 + 3·sections columns, e.g.
  `*_amp_calc.dat` or `*_aver_interf_calc.dat`) are loaded as amplitude magnitudes |A|;
  the section count comes from the header, or is 1 without one. Grids made of separate
  blocks on one regular lattice, such as the PMN "(halves)" files, are placed on that
  lattice with the gaps left empty. When the Cartesian Q columns depend on all three
  indices (hexagonal, monoclinic, ... cells), the grid is fitted with affine step vectors
  so slices keep their true shape.
- **4-column text**: `H K L intensity` rows (diffuse-scattering calculator output).
- **h k l I σ lists**: Scatty `*_list.txt` and Spinteract `*_xtal_data_NN.txt` rows, also
  with extra twin hkl triplets before `I σ`. They are read as HKL volumes of I (not as
  a 2-D matrix); the σ column is not shown.
- **3-column text**: `x y value` triplets, shown as a 2-D map.
- **2-D numeric matrix**: plain rectangular matrices of numbers.
- **JSON volume** (`.json`): an object with `shape`, an `intensity`/`signal` array and
  optional axis arrays.
- **Legacy VTK structured points** (`.vtk`).

HDF5 formats (`.h5`, `.hdf5`, `.nx`, `.nx5`, `.nxs`, or any file that starts with the
HDF5 signature), read with h5wasm:

- **Unified diffuse-scattering HDF5** (`/scattering/data`) as used by the
  DiffuseDevelopers data contract. Both disk layouts in use are read: C order
  `[H,K,L]` (the DiffuseDevelopers Python writer, NeXus files with `h_indices`) and
  `[L,K,H]` with H fastest (3DSConvert and Fortran writers). The layout is taken from
  NeXus `*_indices` attributes or the axis lengths; when a cubic file records neither,
  `[L,K,H]` is assumed and a **Swap H/L data order** button is offered.
- **RMCProfile / DiffuseCode Fortran unified HDF5** (`/entry/data/data_values` with
  corner and increment-vector grid metadata).
- **DISCUS / Yell 1.0 HDF5** (`/data` with `lower_limits`, `step_sizes` and `is_direct`;
  direct-space Yell 3D-PDF files are supported).
- **Generic NeXus signal files**, e.g. `MDHistoWorkspace/data/signal` or
  `entry/data/signal`. The signal's `axes` attribute sets the axis order, so Mantid
  MDHisto files (stored `[D2][D1][D0]`) are put back in dimension order. HKL projection
  names such as `[H,H,0]` are taken from the axis `long_name` and keep their Q geometry,
  and a `mask` dataset next to the signal hides masked voxels.

## Getting started

1. Clone or download this repository.
2. Open `index.html` in a modern browser. All application code is local, so
   opening the file directly usually works; if your browser restricts local pages, serve
   the folder instead, e.g.:

   ```
   python -m http.server 8000
   ```

   and browse to `http://localhost:8000/index.html`.
3. Drop a data file onto the input area (or click it to browse).

HDF5/NeXus reading and the unified HDF5 export use the vendored h5wasm engine in
`js/h5wasm.js`, so they work offline and from a `file://` page. Only **Plotly**
(`cdn.plot.ly`, v2.35.2) is fetched from a CDN on demand; it is needed for the two 3-D
panels and the SVG/HTML plot exports. Text and HDF5 loading and the 2-D slice map work
without it.

## Development

The file loaders are covered by a Node test suite (Node 20 or newer, no
dependencies). The tests run the page's own script in a Node `vm` context and
build their data fixtures in memory:

```
npm test
```

## Provenance

This repository was extracted, with full git history, from the
[MaximEremenko/Utilities](https://github.com/MaximEremenko/Utilities) monorepo using
`git filter-repo`. The unified HDF5 reader/writer helper `js/unified_hdf5.js` was
vendored from that monorepo's `RMCProfileUtilities/Format_Converter`. The companion
diffuse-scattering calculator, [3DSCalculator](https://github.com/MaximEremenko/3DSCalculator), lives in its own repository.

## Third-party code

`js/h5wasm.js` is a vendored copy of [h5wasm](https://github.com/usnistgov/h5wasm) 0.10.3
(the HDF5 library compiled to WebAssembly, with the `.wasm` binary embedded), identical to
the copies in 3DSConvert and 3DSCalculator. It is distributed under the NIST and HDF5
license terms reproduced in [`js/h5wasm-LICENSE.txt`](js/h5wasm-LICENSE.txt).

## License

Apache License 2.0 — see [LICENSE](LICENSE). Third-party components keep their own
licenses as noted above.
