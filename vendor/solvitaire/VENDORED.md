# Vendored Solvitaire

This directory contains Solvitaire at upstream commit
`23983059f1d3d67632d5a4f731c803c6b0c8c236` from
<https://github.com/thecharlieblake/Solvitaire>.

Solvitaire is licensed separately under GNU GPL v2; see `LICENSE`. It is an
offline corpus-certification tool, invoked as a separate executable, and is
not bundled with the Better Solitaire web or iOS application.

The following small portability changes were made on 2026-07-24:

- raise the nested GoogleTest CMake compatibility declaration to 3.5;
- remove obsolete Linux-specific compiler/linker flags;
- remove unused OpenMP and `malloc.h` includes;
- add direct standard-library `<set>` includes required by current Clang.
- make upstream's configure-time GoogleTest download opt-in so the offline
  certification binary builds without fetching test dependencies.

The source is committed so future corpus expansions use the same independently
pinned solver rather than relying on a temporary local clone.
