# 3DSView

A browser-based viewer — formerly the 3DS Plotter — for slicing through 3-D diffuse-scattering volumes produced by
RMCProfile and related programs. The application is a single HTML file
(`index.html`) plus a small local helper script (`js/unified_hdf5.js`) used
for the unified HDF5 export, and it runs fully client-side: files are parsed in the
browser, nothing is uploaded anywhere. It loads RMCProfile 3DS text output, unified HDF5 volumes,
DISCUS/Yell HDF5 and generic NeXus files, and provides interactive axis, arbitrary-plane
and slab-average slicing with linked 2-D and 3-D views.

## Features

- **Three linked views**: a 3-D rendering of the current slice plane, a 3-D isosurface of
  the whole volume (both Plotly), and a 2-D slice heatmap drawn on a canvas with live
  statistics.
- **Three slice modes**:
  - *Axis*: fix H, K or L and step through the volume with an index slider.
  - *Normal plane*: define an arbitrary plane by its normal and origin in HKL/Q space,
    move it along the normal, and control the interpolation resolution and plane extent.
  - *Volume average*: average a slab of adjustable half-width and sample count around the
    plane.
- **Coordinate handling**: Q and HKL (r.l.u.) axes are auto-detected from file names and
  metadata, with a manual override (Auto / Use Q / Use HKL). When a unit cell is known,
  HKL data is transformed to Q through the reciprocal basis. Real-space volumes
  (delta-PDF / 3D-PDF, scattering density) are recognized and shown with X/Y/Z or U/V/W
  axes.
- **Unit-cell override**: enter a, b, c, alpha, beta, gamma to apply a cell for
  cell-aware axes, or restore the cell read from the file.
- **Shown-volume limits**: crop the displayed volume per axis with dual-range sliders.
- **Display controls**: log10(value+1), log10, linear and signed-sqrt scales; Viridis,
  Turbo, Inferno, Magma and Gray color maps; slice-auto, global-auto or manual color
  levels, including dragging the color-bar handles directly on the 2-D map.
- **3-D render controls**: isosurface percentile and surface count, voxel cap,
  auto-refresh toggle, independent show/hide for the plane and isosurface views. The
  camera is preserved across slice updates, with zoom and reset buttons on each panel.
- **Large-file handling**: text files larger than 64 MB are streamed line-by-line.
  Regularly ordered indexed files are streamed single-threaded at any size; indexed
  files whose row order cannot be streamed directly are, at 192 MB or more, parsed in
  parallel Web Workers (up to 8). Parsed volumes are cached in IndexedDB so reloading
  the same file is nearly instant.
- **Export**: PNG of the 2-D slice, CSV of the slice values, the full volume as a
  unified HDF5 file (`*_unified.h5`, written in the browser via `js/unified_hdf5.js` and
  h5wasm), SVG snapshots of either 3-D plot, and standalone interactive HTML copies of
  either 3-D plot.

## Supported formats

Text formats (`.dat`, `.txt`, `.csv`) — comment lines starting with `#`, `!` or `;` and
Fortran `D` exponents are handled:

- **RMCProfile 3DS indexed text**: rows of `i j k H K L intensity` with an optional
  `points sections scale offset` header. Files whose name contains `amp` and that carry
  trailing real/imaginary columns are loaded as amplitude magnitudes.
- **4-column text**: `H K L intensity` rows (diffuse-scattering calculator output).
- **3-column text**: `x y value` triplets, shown as a 2-D map.
- **2-D numeric matrix**: plain rectangular matrices of numbers.
- **JSON volume** (`.json`): an object with `shape`, an `intensity`/`signal` array and
  optional axis arrays.
- **Legacy VTK structured points** (`.vtk`).

HDF5 formats (`.h5`, `.hdf5`, `.nx`, `.nxs`), read with h5wasm:

- **Unified diffuse-scattering HDF5** (`/scattering/data`) as used by the
  DiffuseDevelopers data contract.
- **RMCProfile / DiffuseCode Fortran unified HDF5** (`/entry/data/data_values` with
  corner and increment-vector grid metadata).
- **DISCUS / Yell 1.0 HDF5** (`/data` with `lower_limits`, `step_sizes` and `is_direct`;
  direct-space Yell 3D-PDF files are supported).
- **Generic NeXus signal files**, e.g. `MDHistoWorkspace/data/signal` or
  `entry/data/signal`.

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

Two libraries are fetched from CDNs on demand, so an internet connection is required for
the corresponding features:

- **Plotly** (`cdn.plot.ly`, v2.35.2) — needed for the two 3-D panels and the SVG/HTML
  plot exports.
- **h5wasm** (`cdn.jsdelivr.net`, v0.7.5) — needed to read HDF5/NeXus files and to write
  the unified HDF5 export.

Text-format loading and the 2-D slice map work without either library.

## Provenance

This repository was extracted, with full git history, from the
[MaximEremenko/Utilities](https://github.com/MaximEremenko/Utilities) monorepo using
`git filter-repo`. The unified HDF5 reader/writer helper `js/unified_hdf5.js` was
vendored from that monorepo's `RMCProfileUtilities/Format_Converter`. The companion
diffuse-scattering calculator, [3DSCalc](https://github.com/MaximEremenko/3DSCalc), lives in its own repository.

## License

Apache License 2.0 — see [LICENSE](LICENSE).
