# Browser experiment matrix

Both sessions used a fresh Chromium context. The case sweep opened pristine starters. The second session followed each lesson in order, preserving its shared kernel across case switches. An extra run before an explicitly required restoration records what the case switch alone does. Repeated histogram rows are separate executions. [Full starter Console and expected arrays](evidence/cases-final.jsonl) · [Full sequential Console and literal edit pairs](evidence/steps-final.jsonl) · [Independent CPU oracle results](evidence/oracles.log)

## Starter sweep

| Lesson | Case | Observed output preview | Independent NumPy comparison |
|---|---|---|---|
| first-value | One element | out = [42.0] | Shape and values match |
| vector-add | 33 elements · 32 threads per block | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 87.0, 90.0, 93.0, 96.0, 99.0] | Shape and values match |
| vector-add | 33 elements · 16 threads per block | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 87.0, 90.0, 93.0, 96.0, 99.0] | Shape and values match |
| vector-add | 32 elements · exact fit | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 84.0, 87.0, 90.0, 93.0, 96.0] | Shape and values match |
| grid-stride | 35 elements · 16 threads total | out = [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, … 0, 62.0, 64.0, 66.0, 68.0, 70.0] | Shape and values match |
| grid-stride | 35 elements · 8 threads total | out = [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, … 0, 62.0, 64.0, 66.0, 68.0, 70.0] | Shape and values match |
| grid-stride | 7 elements · 16 threads total | out = [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, 14.0] | Shape and values match |
| transfers | 33 elements | out = [1.0, 1.75, 2.5, 3.25, 4.0, 4.75 …  22.0, 22.75, 23.5, 24.25, 25.0] | Shape and values match |
| transfers | 8 elements | out = [1.0, 1.75, 2.5, 3.25, 4.0, 4.75, 5.5, 6.25] | Shape and values match |
| coalescing | 8 rows × 32 columns | out = [[1.0, 33.0, 65.0, 97.0, 129.0,  … .0, 160.0, 192.0, 224.0, 256.0]] | Shape and values match |
| coalescing | 5 rows × 13 columns | out = [[1.0, 14.0, 27.0, 40.0, 53.0],  …  [13.0, 26.0, 39.0, 52.0, 65.0]] | Shape and values match |
| divergence | Alternating signs | out = [-0.25, 2.0, -0.75, 4.0, -1.25,  … 0.0, -15.25, 62.0, -15.75, 64.0] | Shape and values match |
| divergence | Grouped signs | out = [-0.25, -0.5, -0.75, -1.0, -1.25 … 0, 60.0, 61.0, 62.0, 63.0, 64.0] | Shape and values match |
| reduction | 16 values · 8 threads per block | out = [36.0, 100.0] | Shape and values match |
| reduction | 19 values · partial block | out = [36.0, 100.0, 54.0] | Shape and values match |
| reduction | 39 values · 32 threads | out = [528.0, 252.0] | Shape and values match |
| histogram | Balanced destinations | counts = [8, 8, 8, 8] | Shape and values match |
| histogram | All tokens route to 2 | counts = [0, 0, 32, 0] | Shape and values match |
| scan | Keep flags · 7 elements | out = [1, 1, 2, 3, 3, 3, 4] | Shape and values match |
| scan | Weighted counts · 13 elements | out = [2, 6, 6, 9, 10, 15, 15, 15, 16, 18, 21, 25, 26] | Shape and values match |
| tiled-transpose | 8 rows × 8 columns | out = [[1.0, 9.0, 17.0, 25.0, 33.0, 41 … , 32.0, 40.0, 48.0, 56.0, 64.0]] | Shape and values match |
| tiled-transpose | 11 rows × 13 columns | out = [[1.0, 14.0, 27.0, 40.0, 53.0, 6 … .0, 104.0, 117.0, 130.0, 143.0]] | Shape and values match |
| matmul | 5 × 6 times 6 × 7 | out = [[4.0, 5.5, 2.0, 6.0, 5.0, 4.0,  … .5, 15.0, 13.5, 7.0, 10.5, 6.5]] | Shape and values match |
| matmul | 4 × 4 times 4 × 4 | out = [[-2.0, -0.5, -1.5, -5.0], [13.5 … .0, 0.0], [6.0, -2.0, 5.0, 9.5]] | Shape and values match |
| softmax | Extreme and equal logits | out = [[0.4136219918727875, 0.15216302 … 02101898, 0.007263700477778912]] | Shape and values match |
| softmax | Two rows · 37 columns | out = [[5.301694181980565e-05, 0.00014 … 86160994, 0.004498564638197422]] | Shape and values match |
| gather | Consecutive positions | out = [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0] | Shape and values match |
| gather | Spaced positions | out = [100.0, 108.0, 116.0, 124.0, 132.0, 140.0, 148.0, 156.0] | Shape and values match |
| stencil | 16 values · direct reads | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 36.0, 39.0, 42.0, 45.0, 31.0] | Shape and values match |
| stencil | 16 values · shared tile | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 36.0, 39.0, 42.0, 45.0, 31.0] | Shape and values match |
| stencil | 13 values · partial tile | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 27.0, 30.0, 33.0, 36.0, 25.0] | Shape and values match |
| precision | Near the precision limit | out = [0.0, 1.0] | Shape and values match |
| precision | Smaller integers | out = [1.0, 1.0] | Shape and values match |
| sync-debug | 7 outputs · partial block | out = [1, 2, 3, 0, 5, 6, -1] | Shape and values match |
| sync-debug | 8 outputs · two full blocks | out = [1, 2, 3, 0, 5, 6, 7, 4] | Shape and values match |
| fusion | 8 values · store temporary | out = [0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 3.5, 5.0] | Shape and values match |
| fusion | 8 values · keep local | out = [0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 3.5, 5.0] | Shape and values match |
| fusion | 13 values · keep local | out = [0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 3.5, 5.0, 6.5, 8.0, 9.5, 11.0, 12.5] | Shape and values match |

## Authored sequence

Read the corresponding row in [lesson decisions](lessons.md) for the hand calculations and interpretation. A successful execution means the program completed. Some edited results intentionally differ from the starter.

| Run | Lesson / case | Action | Actual Console preview |
|---:|---|---|---|
| 1 | first-value / One element | Select case and run | out = [42.0] |
| 2 | first-value / One element | out[0] = 42 → out[0] = 73 | out = [73.0] |
| 3 | first-value / One element | return result → print(out_host.tolist()) ↵     return result | out = [73.0] · [0.0] |
| 4 | vector-add / 33 elements · 32 threads per block | Select case and run | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 87.0, 90.0, 93.0, 96.0, 99.0] |
| 5 | vector-add / 33 elements · 32 threads per block | kernel[2, 32] → kernel[3, 16] | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 87.0, 90.0, 93.0, 96.0, 99.0] |
| 6 | grid-stride / 35 elements · 16 threads total | Select case and run | out = [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, … 0, 62.0, 64.0, 66.0, 68.0, 70.0] |
| 7 | grid-stride / 35 elements · 16 threads total | kernel[2, 8] → kernel[2, 4] | out = [2.0, 4.0, 6.0, 8.0, 10.0, 12.0, … 0, 62.0, 64.0, 66.0, 68.0, 70.0] |
| 8 | transfers / 33 elements | Select case and run | out = [1.0, 1.75, 2.5, 3.25, 4.0, 4.75 …  22.0, 22.75, 23.5, 24.25, 25.0] |
| 9 | transfers / 33 elements | return result → print(x_host.nbytes, y_host.nbytes, result.nbytes) ↵     return result | out = [1.0, 1.75, 2.5, 3.25, 4.0, 4.75 …  22.0, 22.75, 23.5, 24.25, 25.0] · 132 132 132 |
| 10 | transfers / 8 elements | Select case and run | out = [1.0, 1.75, 2.5, 3.25, 4.0, 4.75, 5.5, 6.25] |
| 11 | transfers / 8 elements | return result → print(x_host.nbytes, y_host.nbytes, result.nbytes) ↵     return result | out = [1.0, 1.75, 2.5, 3.25, 4.0, 4.75, 5.5, 6.25] · 32 32 32 |
| 12 | coalescing / 8 rows × 32 columns | Select case and run | out = [[1.0, 33.0, 65.0, 97.0, 129.0,  … .0, 160.0, 192.0, 224.0, 256.0]] |
| 13 | coalescing / 8 rows × 32 columns | return result → print(result[:8, 0]) ↵     return result | out = [[1.0, 33.0, 65.0, 97.0, 129.0,  … .0, 160.0, 192.0, 224.0, 256.0]] · [1. 2. 3. 4. 5. 6. 7. 8.] |
| 14 | coalescing / 5 rows × 13 columns | Select case and run | out = [[1.0, 14.0, 27.0, 40.0, 53.0],  …  [13.0, 26.0, 39.0, 52.0, 65.0]] |
| 15 | divergence / Alternating signs | Select case and run | out = [-0.25, 2.0, -0.75, 4.0, -1.25,  … 0.0, -15.25, 62.0, -15.75, 64.0] |
| 16 | divergence / Alternating signs | return result → print(np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0)) ↵     return result | out = [-0.25, 2.0, -0.75, 4.0, -1.25,  … 0.0, -15.25, 62.0, -15.75, 64.0] · 16 16 |
| 17 | divergence / Grouped signs | Select case and run | out = [-0.25, -0.5, -0.75, -1.0, -1.25 … 0, 60.0, 61.0, 62.0, 63.0, 64.0] |
| 18 | divergence / Grouped signs | return result → print(np.count_nonzero(result[:32] < 0), np.count_nonzero(result[32:] < 0)) ↵     return result | out = [-0.25, -0.5, -0.75, -1.0, -1.25 … 0, 60.0, 61.0, 62.0, 63.0, 64.0] · 32 0 |
| 19 | reduction / 16 values · 8 threads per block | Select case and run | out = [36.0, 100.0] |
| 20 | reduction / 19 values · partial block | Select case and run | out = [36.0, 100.0, 54.0] |
| 21 | histogram / Balanced destinations | Select case and run | counts = [8, 8, 8, 8] |
| 22 | histogram / All tokens route to 2 | Select case and run | counts = [0, 0, 32, 0] |
| 23 | histogram / All tokens route to 2 | cuda.atomic.add(counts, tokens[i], 1) → counts[tokens[i]] += 1 | counts = [0, 0, 2, 0] |
| 24 | histogram / All tokens route to 2 | Repeat and run | counts = [0, 0, 2, 0] |
| 25 | histogram / All tokens route to 2 | Repeat and run | counts = [0, 0, 2, 0] |
| 26 | histogram / All tokens route to 2 | Repeat and run | counts = [0, 0, 2, 0] |
| 27 | histogram / All tokens route to 2 | Restore and run | counts = [0, 0, 32, 0] |
| 28 | scan / Keep flags · 7 elements | Select case and run | out = [1, 1, 2, 3, 3, 3, 4] |
| 29 | scan / Weighted counts · 13 elements | Select case and run | out = [2, 6, 6, 9, 10, 15, 15, 15, 16, 18, 21, 25, 26] |
| 30 | tiled-transpose / 8 rows × 8 columns | Select case and run | out = [[1.0, 9.0, 17.0, 25.0, 33.0, 41 … , 32.0, 40.0, 48.0, 56.0, 64.0]] |
| 31 | tiled-transpose / 8 rows × 8 columns | return result → print(result[0, 2]) ↵     return result | out = [[1.0, 9.0, 17.0, 25.0, 33.0, 41 … , 32.0, 40.0, 48.0, 56.0, 64.0]] · 17.0 |
| 32 | tiled-transpose / 8 rows × 8 columns | PADDING = 1 → PADDING = 0 | out = [[1.0, 9.0, 17.0, 25.0, 33.0, 41 … , 32.0, 40.0, 48.0, 56.0, 64.0]] · 17.0 |
| 33 | tiled-transpose / 11 rows × 13 columns | Select case and run | out = [[1.0, 14.0, 27.0, 40.0, 53.0, 6 … .0, 104.0, 117.0, 130.0, 143.0]] |
| 34 | tiled-transpose / 11 rows × 13 columns | Restore and run | out = [[1.0, 14.0, 27.0, 40.0, 53.0, 6 … .0, 104.0, 117.0, 130.0, 143.0]] |
| 35 | matmul / 5 × 6 times 6 × 7 | Select case and run | out = [[4.0, 5.5, 2.0, 6.0, 5.0, 4.0,  … .5, 15.0, 13.5, 7.0, 10.5, 6.5]] |
| 36 | matmul / 4 × 4 times 4 × 4 | Select case and run | out = [[-2.0, -0.5, -1.5, -5.0], [13.5 … .0, 0.0], [6.0, -2.0, 5.0, 9.5]] |
| 37 | softmax / Extreme and equal logits | Select case and run | out = [[0.4136219918727875, 0.15216302 … 02101898, 0.007263700477778912]] |
| 38 | softmax / Extreme and equal logits | return result → print(result.sum(axis=1)) ↵     return result | out = [[0.4136219918727875, 0.15216302 … 02101898, 0.007263700477778912]] · [1.0000001 1.0000001] |
| 39 | softmax / Extreme and equal logits | - row_max) → )<br>return result → print(np.isfinite(result).all()) ↵     return result | out = [[nan, nan, nan, nan, 0.0], [nan, nan, nan, nan, nan]] · [nan nan] False |
| 40 | softmax / Two rows · 37 columns | Select case and run | out = [[5.301694545778446e-05, 0.00014 … , nan, nan, nan, nan, nan, nan]] |
| 41 | softmax / Two rows · 37 columns | Restore and run | out = [[5.301694181980565e-05, 0.00014 … 86160994, 0.004498564638197422]] |
| 42 | gather / Consecutive positions | Select case and run | out = [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0] |
| 43 | gather / Spaced positions | Select case and run | out = [100.0, 108.0, 116.0, 124.0, 132.0, 140.0, 148.0, 156.0] |
| 44 | gather / Spaced positions | values[indices[i]] → values[i] | out = [100.0, 101.0, 102.0, 103.0, 104.0, 105.0, 106.0, 107.0] |
| 45 | stencil / 16 values · direct reads | Select case and run | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 36.0, 39.0, 42.0, 45.0, 31.0] |
| 46 | stencil / 16 values · shared tile | Select case and run | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 36.0, 39.0, 42.0, 45.0, 31.0] |
| 47 | stencil / 16 values · shared tile | tile[0] = values[i - 1] if i > 0 else 0.0 → tile[0] = 0.0 | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 36.0, 39.0, 42.0, 45.0, 31.0] |
| 48 | stencil / 13 values · partial tile | Select case and run | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 19.0, 30.0, 33.0, 36.0, 25.0] |
| 49 | stencil / 13 values · partial tile | Restore and run | out = [3.0, 6.0, 9.0, 12.0, 15.0, 18.0 … 0, 27.0, 30.0, 33.0, 36.0, 25.0] |
| 50 | precision / Near the precision limit | Select case and run | out = [0.0, 1.0] |
| 51 | precision / Near the precision limit | a[i] + b[i] → a[i] + c[i]<br>first + c[i] → first + b[i] | out = [1.0, 1.0] |
| 52 | precision / Smaller integers | Select case and run | out = [1.0, 1.0] |
| 53 | precision / Smaller integers | Restore and run | out = [1.0, 1.0] |
| 54 | sync-debug / 8 outputs · two full blocks | Select case and run | out = [1, 2, 3, 0, 5, 6, 7, 4] |
| 55 | sync-debug / 7 outputs · partial block | Select case and run | out = [1, 2, 3, 0, 5, 6, -1] |
| 56 | sync-debug / 7 outputs · partial block | else -1 → else -9 | out = [1, 2, 3, 0, 5, 6, -9] |
| 57 | fusion / 8 values · store temporary | Select case and run | out = [0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 3.5, 5.0] |
| 58 | fusion / 8 values · keep local | Select case and run | out = [0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 3.5, 5.0] |
| 59 | fusion / 8 values · store temporary | Select case and run | out = [0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 3.5, 5.0] |
| 60 | fusion / 8 values · store temporary | if use_temp: → if False: | out = [0.0, 0.0, 0.0, 0.0, 0.5, 2.0, 3.5, 5.0] |
