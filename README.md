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
- **Window layout**: everything sits on one screen. The top bar holds **Open**, the
  file and its grid, the latest message (click it for recent messages), **Export**, the
  theme and the shortcuts. Under it, one bar serves every view: the volume on show (with
  × back to the data), A / Split / B when a calculation is loaded, the colour map, the
  scale, the level range with **Auto**, a button for the level and colour settings, and
  **Map** / **Map + 3-D**. The 2-D map is the main view. Its head switches between
  **Axis** and **Plane** slices and between the planes (H-K, K-L, H-L), turns on the three
  linked slices and the integer grid, opens the slice settings (map resolution,
  averaging, the normal plane, the shown volume), and ends with the slice statistics and
  buttons for the profiles, a PNG and a larger map. Under the map sit the slice slider
  (with ‹ › step buttons) and the averaging width. The values beside the slider can be
  typed into: the slice coordinate or slice number, and the centre of a normal plane
  (e.g. `0.4, 0, 0`), which the plane then passes through exactly. Before a file is
  opened, the map shows only the welcome card. The 3-D views share a dock beside the
  map, with their settings in its head. Show the slice plane, the isosurface, both, or
  the structure, drag the splitters to resize, enlarge the map or the dock, or hide the
  dock. Only the 3-D views on screen are drawn; a hidden view is drawn when it is shown
  again, and Plotly is not loaded until a 3-D view is needed.
- **Steps panel**: the left panel lists the steps of the work, always open: *Data*,
  *Compare*, *Symmetry* and *Mask preview*. Each shows what it holds on its first line
  (the grid, the calculation, the Laue class, the share removed), its actions, and a row
  of **Show** buttons for the volumes it gives: the data, σ and I/σ; the comparison,
  split, A − B, A / B and (A − B)/σ; the symmetrized data, data − symmetrized and the
  equivalents found; the masked data and the removed voxels. A button is live once its
  volume exists, and the one on show is lit. Options and explanations open from the ⚙
  and ⓘ buttons. <kbd>B</kbd> or the button at the left of the top bar hides the panel.
  The layout and the splitter positions are remembered between visits.
- **Files**: drop a file anywhere in the window, or use **Open**. *Details* in the Data
  step (or a click on the file name) gives the file's format, grid and value range, and the ranges of its axes
  as the map and the shown volume use them (H, K, L in r.l.u. for an HKL grid); when the
  3-D views draw through a cell, their Cartesian ranges follow on a line of their own.
  The page address can name files to open on start, e.g.
  `index.html?url=data/run.nxs&compare=data/run_calc.dat&structure=data/run.rmc6f`.
  Relative addresses resolve against the page; files on another host open when that
  host allows cross-origin requests.
  Several files can be opened or dropped together, or a whole run folder opened (see
  *Compare*). A file opens on the slice at 0 (such as HK0, or r = 0 of a ΔPDF map), on
  the middle slice when the axis does not reach 0, and on the nearest slice holding data
  when that slice falls in a gap of a block grid.
- **Profiles** (the strip under the map, <kbd>P</kbd>):
  - **Line cuts:** open the profiles on *Line cut* and drag across the map. Until a cut
    is drawn the cut tool is on; **Draw** in the strip (or <kbd>L</kbd>) turns it on and
    off, and with it off the map pans and zooms by dragging again. Drag an end to adjust
    the cut, drag the line to move it, or click to clear it. The cut
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
  - **Views:** the Compare step's Show buttons give the scaled comparison, data −
    comparison, data / comparison and (data − comparison)/σ. The scaled comparison shares the data's colour levels, and
    <kbd>C</kbd> flips between the two.
  - **Split view:** *Split* draws the data below the diagonal of the
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
  normal planes, thin or slab, it is the value drawn there. On a thick slice it is the mean, and
  the readout says how many voxels went into it.
- **2-D zoom and pan**: zoom the map with the mouse wheel (about the cursor) or the +/−
  buttons, or drag a box to zoom into it. A zoomed map pans when dragged (Shift+drag
  still draws a box); double-click or ↺ shows the whole slice again. Ticks follow
  the visible region, skewed grids keep their shape, and each cell is centred on its
  sample.
- **Two slice modes**:
  - *Axis*: fix H, K or L and step through the volume with an index slider. A map can
    average ±N neighbouring slices, set in slices beside the slider or as a half-width in
    axis units (the slice settings); empty voxels stay out, and the
    readout, the line-cut thickness and the comparison's slice agreement follow the slab.
  - *Normal plane*: an arbitrary plane given by its normal and centre in HKL/Q space. A
    typed normal turns the plane about its centre, a typed centre moves the plane through
    it, and the slider moves it along the normal. With *Slab ±* above 0, each point of the
    map is the mean of *Samples across* points through a slab of that half-thickness. The
    map's side is a multiple of the widest data range (*Map size*), and the map is sampled
    at the data resolution unless points per side are set by hand.
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
- **UB matrix** (*UB* in the Data step): the orientation matrix in Mantid's
  convention, Q = 2π·UB·h, which 3DSConvert uses as well. The box shows the UB the data
  were indexed with: the file's, with its sample rotation; for a Q grid, the one its
  cell gives with a along x. Its elements show to six digits, the exact values kept
  behind them, and nine numbers pasted into any field (Mantid's printout, say) fill them
  all. Below the fields, the cell the UB implies and how far it is turned from a* along x.
  - **Apply UB** indexes the data with it. A Q grid is put on HKL, h = (2π·UB)⁻¹·Q, and
    keeps its measured frame. An HKL grid is re-indexed from the UB its file was
    indexed with, so each voxel keeps its Q and takes the HKL of the new UB. An HKL grid
    without a UB or cell of its own keeps its HKL, and the UB sets the lattice.
  - A grid that ends up turned or sheared in HKL is resampled onto H, K and L axes
    through 0, at about its own steps (trilinear, empty voxels left out, σ carried), so
    axis slices are HKL planes and symmetry operators land on grid points. It opens as
    a volume of its own, up to 48 million voxels.
  - **Rotate** turns the UB about the x, y and z axes of Q by the angles given and
    applies it, for lining Bragg peaks up with integer HKL by eye.
  - Every UB starts from the file's own geometry, so corrections do not add up;
    **Restore file UB** returns to the file. Projected axes such as [H,H,0] are not
    re-indexed yet.
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
  - Atoms are drawn smaller as the block holds more of them, so a large supercell does
    not fill the view as one solid ball.
  - The camera tools work as in the other views: view along a*, b*, c*, a, b, c or a
    typed direction, roll, tilt, turn and orthographic projection.
- **Interatomic vectors** (<kbd>V</kbd>, or the button above the map): on a real-space map
  (3D-ΔPDF, Patterson) with a structure loaded, every interatomic vector plus lattice
  translations that falls in the shown axis slice (or thick slice) is marked with a
  ring, one colour per element pair and nested rings where pairs share a vector. u, v, w
  maps are in lattice units; for x, y, z maps in Å the structure is taken with a along x.
  The readout names the vector under the cursor, [u v w] and |r|, and its pairs. When
  the marks would crowd the map, zoom in.
- **Shown-volume limits**: crop the displayed volume per axis. Each axis has a row with
  its lower limit, a dual-range slider and its upper limit; a typed limit or a released
  slider applies at once. The limits, like the other coordinate fields, are rounded to
  the precision the grid step needs, so float32 axes read -8 rather than -7.999999508.
- **Resolution**: each figure's resolution is set, and shown, next to the figure's other
  settings.
  - **Map resolution** (the selector above the map): the chosen entry names the points
    drawn, such as *Data resolution · 135 × 135*, and its tooltip gives the spacing.
    Axis slices show every data point, up to 1.5 million, so the selector rests for them.
    Normal-plane maps are sampled at the finest data step by default (*Data resolution*),
    twice as fine (*2× finer*), or at the points per side typed in the slice settings
    (*Custom points*, up to 2400). While a slice or plane is dragged, the map keeps its
    full resolution up to 400,000 cells (planes up to 360 points per side, slabs 180) and
    is redrawn in full when the move ends.
  - **3-D plane points per side** (3-D settings; 180 by default, up to 520), with the points
    and spacing drawn.
  - **Isosurface voxel cap** (3-D settings), with the samples and spacing it gives; the
    stride follows from it.
  - **PNG resolution** (**Export**): 1x to 4x the size on screen, with the resulting
    pixel size of each figure.
  - The 3-D views' headers and the statistics in the map's head also give each figure's
    points and spacing.
- **Display controls**:
  - **Scales:** log10(value+1), log10, linear, signed-sqrt and asinh(value / s). asinh is
    linear well below the softening s and logarithmic well above it, for either sign,
    which suits wide ranges and difference maps. s defaults to the median of the positive
    values and can be typed in the level settings.
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
    value range, both zoom onto it, and arrows on the bar mark the range beyond. The
    zoom holds while the levels move, so the ends of the bar and the handle you did not
    touch stay where they are. Dragging a handle past an end reaches the rest of the
    range, and the zoom follows when you let go.
  - **Signed data:** real-space volumes (delta-PDF, Patterson, density) open on a linear
    scale with RdBu and symmetric levels.
- **Volumes on show**: the Show buttons of the steps choose what the map, the 3-D views,
  the readout and the exports show: the data, the symmetrized volume, data −
  symmetrized, the number of equivalents found per voxel, or σ and I/σ when the file has
  uncertainties. The bar over the views names the volume on show. Differences
  open on a linear scale with RdBu and symmetric levels, and the earlier settings come
  back with the data; exported file names get a tag such as `_sym` or `_symdev`.
- **Symmetry** (the Symmetry step): Laue-class symmetrization for all 11 Laue classes, with
  −3m1 and −31m, and rhombohedral settings for the trigonal classes. Each voxel is
  averaged with its symmetry equivalents that hold data (empty voxels stay out, σ is that
  of the mean), or only the empty voxels are filled; with −1 this completes Friedel
  pairs. The operators act in the data's own frame: HKL grids (projected axes such as
  [H,H,0] included), Q grids through the cell, Cartesian Q with a along x for the
  non-hexagonal classes, and real-space grids. Operators whose images fall between grid
  points are skipped and reported. For example, when L has a different step from H and
  K, m−3m keeps only its 4/mmm part. The class is suggested from the file name (e.g.
  `_m-3m`) or from the cell metric. *Data − symmetrized* shows where the data break the
  symmetry, and *Equivalents found* shows the coverage. The symmetrized view can be
  exported like the data; symmetrization as a recorded processing step is done in
  3DSConvert.
  - **Custom operations:** the Laue class list ends with *Custom operations…*. Type
    generators separated by `;`, either as reciprocal triplets (`h+k,-h,l` is the six-fold
    about c* in hexagonal axes) or as real-space ones (`x-y,x,z`). Translations are
    dropped. The generators are closed into a group with the inversion; anything that
    does not close within 48 operations, or is not an integer rotation, is refused. The
    hint's tooltip lists the operations.
  - **Metric check:** for every class the hint says how much the operations change the
    reciprocal metric, and warns above 2 %, when they probably belong to another setting.
  - **Extend the grid:** by default symmetrization works inside the file's grid, so the
    images of a half or a quadrant that fall outside it are not created. With *Extend the
    grid to its symmetric images*, the grid grows to hold every image of the shown volume
    under the operators that land on grid points. Each voxel of the grown grid is the mean
    of its equivalents with data (or, with *Fill empty voxels only*, keeps its measured
    value).
    - The result opens as a volume of its own, since its grid differs, and can be
      exported like any data. Meanwhile the **Clear** button reads *Back to the measured
      data* and returns to the file.
    - The grown grid is limited to 48 million voxels; crop the shown volume first for
      larger ones.
- **Mask preview** (the Mask preview step): shows what a mask would remove, as two
  views, *Masked data* and *Removed*. Masking as a recorded processing step is done
  in 3DSConvert.
  - *Edge erosion* marks measured voxels within r voxels (box distance) of empty ones,
    where detector edges leave high values. The edge of the grid does not count.
  - The *outlier cut* marks voxels more than k robust standard deviations (1.4826 × MAD,
    at least 0.1 % of the median) above the median of their symmetry equivalents, using
    the Laue class above, for orbits with at least three voxels with data. Each orbit is
    visited once: about 2 s for 10 million voxels.
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
  opacity, and *Redraw the 3-D views as the data and the slice change* (on by default;
  with it off, **Render 3-D** draws them).
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
  - **Figures:** **Export** in the top bar lists each figure with its formats.
    - **Map:** PNG, also from the button above the map; SVG, with vector axes, ticks and a
      colour-bar legend over the embedded slice image; and CSV, with native coordinates,
      u/v for plane slices, Q when a reciprocal basis is known, and the value.
    - **Slice plane, isosurface and structure:** PNG images, SVG snapshots and
      standalone interactive HTML copies.
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
