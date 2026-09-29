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

- **Three linked views**: a 2-D slice heatmap drawn on a canvas, a 3-D rendering of the
  current slice plane and a 3-D isosurface of the whole volume (both Plotly), plus a
  Structure view of the crystal structure.
- **Window layout**: the 2-D map is the main view. The slice mode, the plane shown, the
  value scale and the colour map sit above it, and the slice slider (with ‹ › step
  buttons) sits below it. The values beside the slider can be typed into: the slice
  coordinate or slice number, and the centre of a normal plane or slab (e.g.
  `0.4, 0, 0`), which the plane then passes through exactly; so can the centre fields
  on the Slice page. The 3-D views share a dock beside the map. Show the slice plane,
  the isosurface, both, or the structure, drag the splitters to resize, enlarge the map
  or the dock, or hide the dock (**Map** / **Map + 3-D**). Only the 3-D views on screen
  are drawn; a hidden view is drawn when it is shown again, and Plotly is not loaded
  until a 3-D view is needed.
- **Side panel**: the Data, Slice, Levels, 3-D and Export pages open from the rail on the
  left; click the open page again to hide the panel. The layout, the open page and the
  splitter positions are remembered between visits.
- **Files**: drop a file anywhere in the window, or use **Open**. The status bar shows the
  latest message and the slice statistics; click the message to see recent messages.
  Several files can be opened or dropped together, or a whole run folder opened (see
  *Compare*). A file opens on the slice at 0 (such as HK0, or r = 0 of a ΔPDF map), on
  the middle slice when the axis does not reach 0, and on the nearest slice holding data
  when that slice falls in a gap of a block grid.
- **Profiles** (the strip under the map, <kbd>P</kbd>):
  - **Line cuts:** turn on the cut tool (<kbd>L</kbd>) and drag across the map. Drag an
    end to adjust the cut, drag the line to move it, or click to clear it. The cut
    averages the voxels in a band of the given width across it and thickness along the
    slice normal, one slice by default. Distances are in the plot frame (Å⁻¹ for Q), so
    skewed and non-orthogonal grids measure true lengths. A drawn cut follows its plane as
    you step through the slices, and its band is drawn on the map.
  - **|Q| profiles:** the shown volume is averaged in shells of |Q| (|r| for real-space
    data).
  - **What comes along:** the σ of each mean when σ is known, and the scaled comparison
    when a calculation is loaded, with R per shell on the |Q| profile (sparsely filled
    shells are left out).
  - **Export:** both profiles save as CSV.
  - **Placing the calculation:** it is put on the data grid by coordinates. It can be on
    the same grid (voxel for voxel), on a shifted or smaller grid, or in Q against HKL
    through the cell. Friedel pairs, I(−Q) = I(Q), fill in half-space calculations, and
    trilinear interpolation is available for different steps.
  - **Scale:** least squares for scale and offset (the default) or scale alone, weighted
    by 1/σ² if you choose. The alternatives are the calculation header's values (RMCProfile
    writes its fitted scale and offset there, exp ≈ scale·calc + offset, but they can be
    stale) or none.
  - **Agreement:** R = Σ|y − m| / Σ|y|, wR with 1/σ² weights when σ is known, χ²/N with σ,
    and Σ(y − m)²/Σy², the figure RMCProfile logs. Each is given over the volume and for
    the current axis slice. Voxels without data on either side are left out; with
    *Treat 0 as no data* on, this is RMCProfile's own mask.
  - **Views:** Show offers the scaled comparison, data − comparison, data / comparison and
    (data − comparison)/σ. The scaled comparison shares the data's colour levels, and
    <kbd>C</kbd> flips between the two.
  - **Split view:** *Data | comparison, split* draws the data below the diagonal of the
    view and the scaled comparison above it, on one colour scale. The cut follows the
    view, so it stays across the screen when zoomed. The readout gives both values, and
    profiles include the comparison.
  - **Run folders:** an experimental file `X.dat` is paired with `X_calc.dat`, and
    RMCProfile's amplitude files are listed alongside. An input grid that holds one value
    everywhere (a calculation-only run) gives way to the calculation, and an `.rmc6f`
    supplies the parent cell and the structure.
- **Keyboard shortcuts** (press <kbd>?</kbd> for the list): <kbd>←</kbd>/<kbd>→</kbd> step
  through the slices (<kbd>Shift</kbd> for ten, <kbd>Home</kbd>/<kbd>End</kbd> for the
  ends), <kbd>1</kbd>–<kbd>3</kbd> pick the plane shown, <kbd>+</kbd>/<kbd>−</kbd>/<kbd>0</kbd>
  zoom the map, <kbd>F</kbd> enlarges the map, <kbd>D</kbd> shows or hides the 3-D dock,
  <kbd>B</kbd> the side panel, <kbd>O</kbd> opens a file, <kbd>T</kbd> switches the
  theme and <kbd>V</kbd> marks interatomic vectors on a real-space map. Each axis keeps
  its own slice position.
- **Cursor readout**: hovering over the 2-D map shows the coordinates under the cursor
  (H K L, Q or X Y Z), plus Q, |Q| and the d-spacing when a reciprocal basis is known,
  and the value. On axis slices the value is the voxel itself, at full resolution; on
  plane and slab slices it is the value drawn there. On a thick slice it is the mean, and
  the readout says how many voxels went into it.
- **2-D zoom and pan**: zoom the map with the mouse wheel (about the cursor) or the +/−
  buttons, or drag a box to zoom into it. A zoomed map pans when dragged (Shift+drag
  still draws a box); double-click or ↺ shows the whole slice again. Ticks follow
  the visible region, skewed grids keep their shape, and each cell is centred on its
  sample.
- **Three slice modes**:
  - *Axis*: fix H, K or L and step through the volume with an index slider. A map can
    average ±N neighbouring slices (the Slice page); empty voxels stay out, and the
    readout, the line-cut thickness and the comparison's slice agreement follow the slab.
  - *Normal plane*: define an arbitrary plane by its normal and origin in HKL/Q space,
    move it along the normal, and control the interpolation resolution and plane extent.
  - *Volume average*: average a slab of adjustable half-width and sample count around the
    plane.
- **Three linked slices** (<kbd>G</kbd>, or the grid button beside the plane selector, in
  axis mode): HK, HL and KL through one point, with the point and a shared colour bar in
  the fourth tile.
  - Clicking a view moves the other two through that point, and dashed lines, coloured
    by axis, show where they cut.
  - The framed view is the one the slider, the arrow keys, the readout and the level
    histogram follow; clicking a view frames it.
  - Each view zooms (wheel, box, +/−) and pans on its own, and the PNG export holds all
    three.
  - The line cut and the vector overlay work on the single map.
- **Coordinate handling**: Q and HKL (r.l.u.) axes are auto-detected from file names and
  metadata, with a manual override (Auto / Use Q / Use HKL). When a unit cell is known,
  HKL data is transformed to Q through the reciprocal basis; without one, the override
  only relabels the axes. A Mantid UB matrix is read as Q = 2π·UB·h. Real-space volumes
  (delta-PDF / 3D-PDF, scattering density) are recognized and shown with X/Y/Z or U/V/W
  axes. 3D-ΔPDF maps are made in 3DSConvert (a recipe step, written as unified `uvw` or
  Yell `is_direct` files) and opened here.
- **UB and axis rounding cleanup**: files that store their geometry in float32 (Mantid
  among them) are cleaned as they load.
  - **Lattice:** a reciprocal basis or cell within rounding of an exact lattice is made
    exact. Equal lengths are made equal, and angles near 90°, 120° or 60° are made exact.
    The tolerances are 2·10⁻⁶ relative and 2·10⁻⁴°.
  - **Sample rotation:** a UB matrix is split into its lattice B (Busing–Levy, a* along x)
    and its sample rotation U. HKL grids drop U, so Q is shown in the crystal frame; |Q|
    and d are unchanged. Q grids keep a real rotation, because their grid lies in the
    sample frame. Rotations of rounding size are always dropped.
  - **Axes:** axes that are regular to float32 precision and pass through zero are set to
    exact steps, so the L = 0 plane reads 0 instead of −5.96·10⁻⁸.
  - What changed is reported in the load message and under Unit cell. Exact values from
    text files are left alone.
- **Unit-cell override**: enter a, b, c, alpha, beta, gamma to apply a cell for
  cell-aware axes, or restore the cell read from the file. For Q-space data (RMCProfile
  old text, Scatty VTK, unified files with Q axes) the cell converts the Cartesian Q
  grid to HKL, using the RMCProfile/Scatty frame (a along x, b in the xy-plane); Q stays
  available through the reciprocal basis, and **Restore File Cell** undoes the conversion.
  **Cell from structure file** takes the parent cell from an `.rmc6f` configuration (the
  supercell cell divided by the supercell dimensions), a unified structure `.h5` or a
  CIF, and applies it; the structure opens in the Structure view as well.
- **Structure view** (the Structure tab of the dock): the unit cell, or a block of 2 × 2 × 2
  or 3 × 3 × 3 cells, with its atoms in Cartesian Å (a along x). Load a structure with
  **Load…**, or open or drop one; without data the dock switches to it.
  - An `.rmc6f` configuration or a unified structure `.h5` is averaged into its parent
    cell: atoms are grouped by the site number of each atom line (or by element and
    position when there is none), positions are circular means, so sites on a cell face
    average correctly, and occupancies count atoms per parent cell. Sites that average to
    the same position show as one, with each element's share (for PMN, Nb 0.667 and Mg
    0.333 on the B site).
  - A CIF gives its cell and sites, expanded by the listed symmetry operations; a CIF
    without them shows the listed sites only.
  - The camera tools work as in the other views: view along a*, b*, c*, a, b, c or a
    typed direction, roll, tilt, turn and orthographic projection.
- **Interatomic vectors** (<kbd>V</kbd>, or the button above the map): on a real-space map
  (3D-ΔPDF, Patterson) with a structure loaded, every interatomic vector plus lattice
  translations that falls in the shown axis slice (or thick slice) is marked with a
  ring, one colour per element pair and nested rings where pairs share a vector. u, v, w
  maps are in lattice units; for x, y, z maps in Å the structure is taken with a along x.
  The readout names the vector under the cursor, [u v w] and |r|, and its pairs. When
  the marks would crowd the map, zoom in.
- **Shown-volume limits**: crop the displayed volume per axis with dual-range sliders.
  The limits, like the other coordinate fields, are rounded to the precision the grid
  step needs, so float32 axes read -8 rather than -7.999999508.
- **Resolution** (Slice page, above Shown volume): set how finely each figure is drawn,
  and see the points and spacing that gives.
  - **Map points per side** for normal-plane and slab maps. Axis slices show every data
    point, up to 1.5 million.
  - **3-D plane points per side** (180 by default, up to 520).
  - **Isosurface voxel cap**, the same field as on the 3-D page; the stride follows from it.
  - **PNG image**: 1x to 4x the size on screen, with the resulting pixel size of each
    figure.
  - The 3-D views' headers and the status line under the map also give each figure's
    points and spacing.
- **Display controls**:
  - **Scales:** log10(value+1), log10, linear, signed-sqrt and asinh(value / s). asinh is
    linear well below the softening s and logarithmic well above it, for either sign,
    which suits wide ranges and difference maps. s defaults to the median of the positive
    values and can be typed on the Levels page.
  - **Colour maps:** sequential Viridis, Plasma, Inferno, Magma, Cividis, Turbo and Gray,
    plus diverging RdBu and Coolwarm for signed data. Any map can be reversed, and empty
    voxels can be drawn transparent, gray, white or black.
  - **Levels:** global-auto (the default, so colours keep their meaning while you step
    through slices), slice-auto or manual; the auto choice is remembered. Auto levels
    take a percentile window (0.5–99.5 % by default, so Bragg peaks do not wash out the
    diffuse signal), mean ± 3σ, the interquartile fences Q1 − 1.5·IQR … Q3 + 1.5·IQR, or
    the full range. They can be made symmetric about 0.
  - **Colour bar and histogram:** the colour bar spans the display window, as the map
    does. Drag its handles on the 2-D map, or drag a limit or the whole window on the
    histogram of the shown slice; a click moves the nearer limit, and a double-click on
    the histogram returns to auto levels. The level fields can be typed into at any
    time; typed levels become manual levels. When the window is a small part of the
    value range, both zoom onto it, and arrows on the bar mark the range beyond.
  - **Signed data:** real-space volumes (delta-PDF, Patterson, density) open on a linear
    scale with RdBu and symmetric levels.
- **Show selector**: above the map, choose what the map, the 3-D views, the readout and the
  exports show: the data, the symmetrized volume, data − symmetrized, the number of
  equivalents found per voxel, or σ and I/σ when the file has uncertainties. Differences
  open on a linear scale with RdBu and symmetric levels, and the earlier settings come
  back with the data; exported file names get a tag such as `_sym` or `_symdev`.
- **Symmetry** (Process page): Laue-class symmetrization for all 11 Laue classes, with
  −3m1 and −31m, and rhombohedral settings for the trigonal classes. Each voxel is
  averaged with its symmetry equivalents that hold data (empty voxels stay out, σ is that
  of the mean), or only the empty voxels are filled; with −1 this completes Friedel
  pairs. The operators act in the data's own frame: HKL grids (projected axes such as
  [H,H,0] included), Q grids through the cell, Cartesian Q with a along x for the
  non-hexagonal classes, and real-space grids. Operators whose images fall between grid
  points are skipped and reported. For example, when L has a different step from H and
  K, m−3m keeps only its 4/mmm part. The class is suggested from the file name (e.g.
  `_m-3m`) or from the cell metric. *Data − symmetrized* shows where the data break the
  symmetry, and *Equivalents found* shows the coverage.
  - **Custom operations:** the Laue class list ends with *Custom operations…*. Type
    generators separated by `;`, either as reciprocal triplets (`h+k,-h,l` is the six-fold
    about c* in hexagonal axes) or as real-space ones (`x-y,x,z`). Translations are
    dropped. The generators are closed into a group with the inversion; anything that
    does not close within 48 operations, or is not an integer rotation, is refused. The
    hint's tooltip lists the operations.
  - **Metric check:** for every class the hint says how much the operations change the
    reciprocal metric, and warns above 2 %, when they probably belong to another setting. The symmetrized view can be
  exported like the data; symmetrization as a recorded processing step is done in
  3DSConvert.
- **No-data masks**: voxels without data are shown empty and left out of levels and
  isosurfaces. That covers NaN values, a Mantid `mask`, and I = 0 in RMCProfile text,
  which RMCProfile uses for "no data". The zero mask switches on automatically when at
  least 1 % of values are zero and can be toggled with **Treat 0 as no data**. Exports
  keep the original zeros.
- **Cutaway view**: the Slice plane view can show the block of the shown volume cut open
  at the current axis slice instead of the slice alone. The block has its cut face, a cap
  and four walls, each coloured like the map, and empty voxels leave holes. ⇅ shows the
  other side of the cut.
- **3-D camera tools** (the compass button on each 3-D view): look along a*, b*, c*, a,
  b or c, or along a typed [hkl] or [uvw] direction. Roll, tilt and turn in steps of a
  chosen angle, and switch to an orthographic projection; the choice is remembered.
- **3-D render controls**: isosurface percentile and surface count, voxel cap, surface
  opacity and an auto-refresh toggle.
  - When the voxel cap thins the volume, each sample is by default the mean of its block
    of voxels (empty voxels left out) rather than every n-th voxel. The samples are
    placed so that one block is centred on the origin, which keeps symmetric data
    symmetric.
  - The current slice, or all three linked slices, can be drawn inside the isosurface
    view.
  - The sample is kept while the data and these settings stay the same, so moving a
    slice does not rebuild it.
  - Grids whose axes run along x, y and z in the plot get a true
  isosurface, even when the file's UB matrix carries rounding noise; rotated or skewed
  grids are shown as a point cloud. The camera is preserved across slice updates, with
  zoom and reset buttons on each view, and its distance follows the view's shape so the
  box stays in frame in tall, narrow views.
- **Large-file handling**: text files larger than 64 MB are streamed line-by-line.
  Regularly ordered indexed files are streamed single-threaded at any size; indexed
  files whose row order cannot be streamed directly are, at 192 MB or more, parsed in
  parallel Web Workers (up to 8). Parsed volumes are cached in IndexedDB so reloading
  the same file is nearly instant.
- **Export**:
  - **2-D slice:** PNG; SVG, with vector axes, ticks and a colour-bar legend over the
    embedded slice image; and CSV, with native coordinates, u/v for plane slices, Q when
    a reciprocal basis is known, and the value.
  - **3-D views:** PNG images of the slice plane, the isosurface and the structure; SVG
    snapshots; and standalone interactive HTML copies of either 3-D plot.
  - **PNG resolution:** 1x to 4x the size on screen (2x by default). The map is redrawn at
    that size, so text and lines stay sharp and the data pixels stay crisp; the
    interatomic-vector legend is drawn in when it is shown.
  - **Shown (cropped) volume:**
    - Unified HDF5 (`*_unified.h5`, written in the browser via `js/unified_hdf5.js` and
      h5wasm). The experiment type is kept from the source file, and the cell is derived
      from the reciprocal basis when only a basis is known.
    - Yell 1.0 HDF5, with full step vectors, so skewed grids survive.
    - RMCProfile old `.dat` (`i j k qx qy qz I`, Cartesian Q with a along x).
    - Scatty-style VTK (Cartesian Q; the grid must be axis-aligned in Q).
    - Gaussian `.cube` (Q frame, any skew).
    - 3DSView JSON, which the JSON loader reads back with its grid and coordinate kind.
    - Empty voxels are written as 0 in the text formats. Large text files stream straight
      to disk in browsers with the File System Access API.
  - **File name and backgrounds:** a file-name field overrides the default base name,
    and **Transparent background** drops the page colour from PNG, SVG and HTML output.

## Supported formats

Text formats (`.dat`, `.txt`, `.csv`) — comment lines starting with `#`, `!` or `;`,
Fortran `D` exponents, and Fortran's E-less three-digit exponents (`0.1234-101`) are
handled:

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
  a 2-D matrix), with σ kept for the σ and I/σ views. Mantid `errors_squared` and NeXus
  `errors` next to a signal are read as σ too.
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
  names such as `[H,H,0]` are taken from the axis `long_name` and keep their Q geometry.
  When the workspace carries a `W_MATRIX` log, the projection is taken from it exactly,
  since the names keep only three digits. A `mask` dataset next to the signal hides
  masked voxels. Workspaces with more than three dimensions are read as 3-D when the
  extra ones hold a single bin, such as an integrated energy transfer; the load message
  names what was dropped. Laue symbols in file names, including the `4_mmm` and `-3m_r` forms
  that reduction programs write, suggest the class for symmetrization.

## Getting started

1. Clone or download this repository.
2. Open `index.html` in a modern browser. All application code is local, so
   opening the file directly usually works; if your browser restricts local pages, serve
   the folder instead, e.g.:

   ```
   python -m http.server 8000
   ```

   and browse to `http://localhost:8000/index.html`.
3. Drop a data file anywhere in the window, or press **Open** to browse.

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
