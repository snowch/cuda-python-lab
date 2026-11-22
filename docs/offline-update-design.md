# Offline and update mechanism

This port uses the verified release, download, media-range and two-phase restart implementation from [CUDA C++ Lab](https://github.com/snowch/cuda-cpp-lab/blob/main/docs/offline-update-design.md). It adapts app names, cache/storage scope, header markup, asset locations and restart snapshots to the Python course. There is no simulated offline mode or Test offline access control.

## Reading and explicit saving

Normal top-level online visits and reloads request the live HTML. That document pins its modules, CSS, runtime assets, recordings and downloads to an immutable release. Hash navigation reuses the same reading window and release. An open lesson is never replaced automatically. Version metadata checks are automatic and small; they do not download the full course.

Save offline copy explicitly saves the complete current course. Update offline copy stages a newer release and then offers Restart to update. There is no separate second download after updating. Repair offline copy resumes verified existing files when a saved release is incomplete. Online freshness and offline completeness are distinct facts: Up to date online does not mean downloaded. Only a complete byte-and-SHA-256 scan permits Downloaded and ready to use offline and its tick. A failed update leaves the previous complete copy usable.

The manifest includes the HTML shell, all JavaScript/CSS, starter programs, lesson content and diagrams, all checked-in recording/caption/poster files, licenses and GPU exports, Pyodide/stdlib/NumPy/Numba, the LLVM/NVPTX compiler and the GPGPU-Sim runtime. All runtime fetches resolve relative to the pinned module URL, including the starter JSON, rendered media links and exports. Root and GitHub Pages project-prefix deployments use the same app-relative paths.

## Release contract and transfer

The build starts from an empty output directory, injects the controls, fingerprints all output plus the worker contract, publishes root aliases and `releases/<id>/` copies, and writes a manifest with identity, exact bytes and SHA-256 per path. A clean Git checkout embeds its actual revision; dirty/source-archive builds say Development build rather than inventing one. Release IDs change when behavior or assets change; no full-course background download occurs on worker installation.

Cache names are scoped to the app's full base URL. Download progress represents verified files. Interrupted transfers retain verified files and a durable request for resume. Cancellation ends transfer while keeping resumable files. Where supported, browser Background Fetch can continue work outside the page; otherwise the page resumes when it returns. Browser/OS suspension can still pause work. Persistent storage is requested on an explicit save, without implying the browser can never evict data.

Check whole-release completeness from stored bytes before declaring readiness or switching the selected release. Requests for a pinned file cannot fall through unchecked to a different deployment. An unchanged live alias may repair a file only if its original size and hash match. Media Range requests return proper partial responses. Missing/evicted files produce a recovery page without silently selecting mixed assets or erasing learner work.

## Restart transaction

The service worker asks all affected course tabs to prepare. Each tab rejects while its runner is busy, while text composition is active, before the editor has loaded, or if its work cannot be saved. Save per-tab work, disclosures and reading position in session storage; lock lesson/header navigation briefly. Commit the selected release only when all tabs acknowledge. On failure, release the locks and keep the existing course selected. On success reload each tab, preserving its hash route and saved code, case, prediction, completion and Console/PTX results. Never rerun code automatically. Restart snapshot keys discard temporary `download=1` recovery and release-pin parameters, because the App status link removes those parameters before reloading; retaining them in the key would strand the tab’s snapshot. The Python course needs no iframe restoration or document-swap router.

Removing the saved copy deletes this app's caches/registration after confirmation. It does not clear browser-wide storage, source drafts, preferences, predictions, completion, other apps or previous results.

## Verification

The release-contract test checks deterministic fingerprints, changed assets, exact file hashes/bytes, pinned resources, invalid manifest rejection and lightweight installation. The browser journey saves a real complete course at a Pages-style prefix, disconnects, reloads, navigates lessons, starts a new tab and runs CUDA code offline. It then stages a changed release, restarts two tabs with different work, checks both saved contexts, runs the updated course offline and removes the copy while keeping work. Manager tests separately cover active-run and startup cancellation behavior. Test failures must not be hidden by claiming a successful transfer is equivalent to a verified complete copy.

The reusable upstream design has further migration/failure scenarios and protocol details. This document records the Python-specific adaptations; keep both the code and these differences under review when porting future fixes. Automated checks do not replace testing on a physical Android device or establish learning effectiveness.
