export const diagrams = {
  "first-value": `
    <figure class="concept-diagram">
      <figcaption>Where do the starter’s code and arrays go?</figcaption>
      <div class="hardware-path">
        <section><h3>CPU · host</h3><p><code>main()</code> launches the kernel.</p><p>Original array <code>out_host = [0]</code></p></section>
        <div class="hardware-links"><span class="to-device">Launch kernel</span><span class="to-host">Copy result back</span></div>
        <section><h3>GPU · device</h3>
          <p>One GPU thread executes <code>out[0] = 42</code>.</p>
          <p>Device array <code>out = [42]</code></p>
        </section>
      </div>
      <p>CUDA loads the compiled kernel onto the GPU when needed.</p>
    </figure>`,
  "vector-add": `
    <figure class="concept-diagram">
      <figcaption>Who writes to the array when n is 33?</figcaption>
      <div class="block-coverage">
        <div><strong>Block 0</strong><span>Indices 0–31 · All 32 threads write</span></div>
        <div class="coverage-lanes all-write" aria-hidden="true"></div>
        <div><strong>Block 1</strong><span>Index 32 writes · Indices 33–63 skip</span></div>
        <div class="coverage-lanes one-writes" aria-hidden="true"></div>
      </div>
      <p>Each slot represents one thread. Thread 0 in Block 1 gets the last valid index, 32.</p>
    </figure>`,
  divergence: `
    <figure class="concept-diagram">
      <figcaption>Which warps contain both paths?</figcaption>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Path counts by warp">
        <table>
          <thead><tr><th scope="col">Case</th><th scope="col">Block 0 · 32 lanes</th><th scope="col">Block 1 · 32 lanes</th></tr></thead>
          <tbody>
            <tr><th scope="row">Alternating signs</th><td>16 negative, 16 positive</td><td>16 negative, 16 positive</td></tr>
            <tr><th scope="row">Grouped signs</th><td>32 negative</td><td>32 positive</td></tr>
          </tbody>
        </table>
      </div>
    </figure>`,
  coalescing: `
    <figure class="concept-diagram">
      <figcaption>Where the first eight lanes in the 8 × 32 case read and write</figcaption>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Addresses and sectors for the first eight lanes">
        <table>
          <thead><tr><th scope="col">Operation</th><th scope="col">Word offsets</th><th scope="col">Sectors touched</th></tr></thead>
          <tbody>
            <tr><th scope="row">Read values</th><td>0, 1, 2, 3, 4, 5, 6, 7</td><td>1 (sector 0)</td></tr>
            <tr><th scope="row">Write out</th><td>0, 8, 16, 24, 32, 40, 48, 56</td><td>8 (sectors 0–7)</td></tr>
          </tbody>
        </table>
      </div>
      <p>Each sector holds eight four-byte values. This address calculation assumes both arrays start on sector boundaries.</p>
    </figure>`,
  reduction: `
    <figure class="concept-diagram">
      <figcaption>How the first block combines values 1 through 8</figcaption>
      <ol class="diagram-flow">
        <li><strong>Distance 4</strong><span>Four partial sums<br>[6, 8, 10, 12]</span></li>
        <li><strong>Distance 2</strong><span>Two partial sums<br>[16, 20]</span></li>
        <li><strong>Distance 1</strong><span>One sum<br>36 → out[0]</span></li>
      </ol>
      <p>Each block gets its own scratch array in shared memory on the SM that runs it. At distance 4, the barrier lets Thread 1 read the 6 that Thread 5 wrote to scratch[5].</p>
    </figure>`,
  stencil: `
    <figure class="concept-diagram">
      <figcaption>Where Block 1 gets the neighbors for out[8]</figcaption>
      <div class="table-scroll" tabindex="0" role="region" aria-label="The three inputs to out[8]">
        <table>
          <thead><tr><th scope="col">Role</th><th scope="col">Input index</th><th scope="col">Shared index</th><th scope="col">Value</th></tr></thead>
          <tbody>
            <tr><th scope="row">Left halo</th><td>7</td><td>0</td><td>8</td></tr>
            <tr><th scope="row">Center</th><td>8</td><td>1</td><td>9</td></tr>
            <tr><th scope="row">Right neighbor</th><td>9</td><td>2</td><td>10</td></tr>
          </tbody>
        </table>
      </div>
      <p>After the barrier, Thread 0 adds 8 + 9 + 10 and writes 27 to out[8].</p>
    </figure>`,
  fusion: `
    <figure class="concept-diagram">
      <figcaption>Count the transfers for one element</figcaption>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Memory access counts with and without a temporary">
        <table>
          <thead><tr><th scope="col">Design</th><th scope="col">Arrays read</th><th scope="col">Arrays written</th><th scope="col">Bytes</th></tr></thead>
          <tbody>
            <tr><th scope="row">Store temporary</th><td>x, y, temp</td><td>temp, out</td><td>20</td></tr>
            <tr><th scope="row">Keep local</th><td>x, y</td><td>out</td><td>12</td></tr>
          </tbody>
        </table>
      </div>
      <p>Each array access here uses four bytes. The totals count source operations without modeling traffic through GPU caches.</p>
    </figure>`,
  transfers: `
    <figure class="concept-diagram">
      <figcaption>Array copies for 33 float32 values per array</figcaption>
      <ol class="diagram-flow">
        <li><strong>Host → GPU</strong><span>Upload x and y<br>132 bytes each</span></li>
        <li><strong>GPU</strong><span>Compute out<br>66 reads, 33 writes</span></li>
        <li><strong>GPU → host</strong><span>Download out<br>132 bytes</span></li>
      </ol>
      <p>In the notebook, check the copy sizes with nbytes. Count the kernel’s reads and writes by following the assignment for each active thread.</p>
    </figure>`,
  histogram: `
    <figure class="concept-diagram">
      <figcaption>One possible GPU order for two non-atomic increments</figcaption>
      <table>
        <thead><tr><th scope="col">Step</th><th scope="col">Thread 0</th><th scope="col">Thread 1</th><th scope="col">counts[2]</th></tr></thead>
        <tbody>
          <tr><th scope="row">Both read</th><td>Reads 0</td><td>Reads 0</td><td>0</td></tr>
          <tr><th scope="row">First write</th><td>Writes 1</td><td>Waiting</td><td>1</td></tr>
          <tr><th scope="row">Second write</th><td>Done</td><td>Writes 1</td><td>1</td></tr>
        </tbody>
      </table>
      <p>With atomic adds, the second update increments 1 to 2.</p>
    </figure>`,
  scan: `
    <figure class="concept-diagram">
      <figcaption>Keep flags → running totals → destination positions</figcaption>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Scan example">
        <table>
          <thead><tr><th scope="col">Input index</th><th scope="col">0</th><th scope="col">1</th><th scope="col">2</th><th scope="col">3</th><th scope="col">4</th><th scope="col">5</th><th scope="col">6</th></tr></thead>
          <tbody>
            <tr><th scope="row">Keep flag</th><td>1</td><td>0</td><td>1</td><td>1</td><td>0</td><td>0</td><td>1</td></tr>
            <tr><th scope="row">Running total</th><td>1</td><td>1</td><td>2</td><td>3</td><td>3</td><td>3</td><td>4</td></tr>
            <tr><th scope="row">Destination</th><td>0</td><td>Discard</td><td>1</td><td>2</td><td>Discard</td><td>Discard</td><td>3</td></tr>
          </tbody>
        </table>
      </div>
      <p>For index 6, the flag is 1, so the position is the running total minus one (4 − 1 = 3).</p>
    </figure>`,
  "tiled-transpose": `
    <figure class="concept-diagram">
      <figcaption>How a value changes threads in block (0, 0)</figcaption>
      <ol class="diagram-flow">
        <li><strong>Load</strong><span>Thread (0, 2) reads values[2, 0]<br>and writes tile[2, 0]</span></li>
        <li><strong>Block barrier</strong><span>Wait for all tile writes</span></li>
        <li><strong>Store</strong><span>Thread (2, 0) reads tile[2, 0]<br>and writes out[0, 2]</span></li>
      </ol>
    </figure>`,
  softmax: `
    <figure class="concept-diagram">
      <figcaption>How row 0 gets a common divisor</figcaption>
      <ol class="diagram-flow">
        <li><strong>Find the maximum</strong><span>[1000, 999, 1000, 997, −1000]<br>Maximum = 1000</span></li>
        <li><strong>Shift and exponentiate</strong><span>Shifted scores [0, −1, 0, −3, −2000]<br>Largest exponential = 1</span></li>
        <li><strong>Sum and divide</strong><span>Sum the five exponentials<br>Divide each by the sum</span></li>
      </ol>
    </figure>`,
};
