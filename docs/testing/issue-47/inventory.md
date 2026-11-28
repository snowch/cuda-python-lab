# Notebook inventory

Each row names the fixture and phase IDs baked into the notebook. A phase can be an editable program or a source question. The case list includes independent starters. The [execution ledger](logs/guided-runs.jsonl) gives each phase’s fixture, starting source fingerprint, action, requested evidence and observed output or worked explanation.

| Notebook | Case IDs | Executable phase IDs | Source reasoning IDs |
| --- | --- | --- | --- |
| first-value | `one` | `run`, `write`, `host` | `copy` |
| vector-add | `partial-32`, `partial-16`, `exact-32` | `launch`, `narrow` | `owner` |
| grid-stride | `stride-16`, `stride-8`, `short-7` | `visits`, `eight` | `overlap` |
| transfers | `affine-33`, `affine-8` | `bytes`, `short` | `traffic` |
| coalescing | `wide`, `narrow` | `column`, `edge` | `sectors` |
| divergence | `alternating`, `grouped` | `negative`, `count`, `group` | — |
| reduction | `full-16`, `tail-19`, `wide-39` | `partials`, `tail` | `pair` |
| histogram | `balanced`, `hot` | `balanced`, `hot`, `race`, `restore` | — |
| scan | `flags`, `weights` | `destination`, `weights` | `lane` |
| tiled-transpose | `square`, `edges` | `coordinate`, `padding`, `edges` | — |
| matmul | `rectangular`, `square` | `passes`, `reuse` | `zero` |
| softmax | `extreme`, `wide-37` | `sums`, `overflow`, `lane` | — |
| gather | `consecutive`, `spaced` | `adjacent`, `spaced`, `direct` | `adjacent-sectors`, `spaced-sectors` |
| stencil | `direct`, `shared`, `tail` | `reads`, `compare`, `omit`, `tail` | `loads` |
| precision | `near`, `small` | `round`, `regroup`, `small` | — |
| sync-debug | `partial`, `full` | `full`, `partial`, `sentinel` | `barrier` |
| fusion | `temporary`, `local`, `tail` | `store`, `keep`, `bypass` | — |

17 notebooks, 38 pristine fixtures and 58 phases covering 51 authored instructions. The 46 executable phases produced 56 guided simulator runs, including deliberate repeats and before/after comparisons. Twelve phases called for source reasoning. The full [M1.2 instructional matrix](../issue-45/matrix.md) names preparation steps and evidence for each instruction.
