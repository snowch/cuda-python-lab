export const diagrams = {
  "vector-add": `
    <figure class="concept-diagram">
      <figcaption>Who writes to the array when n is 33?</figcaption>
      <div class="table-scroll" tabindex="0" role="region" aria-label="Thread coverage for 33 elements">
        <table>
          <thead><tr><th scope="col">Block</th><th scope="col">Global indices</th><th scope="col">Threads that pass i &lt; 33</th></tr></thead>
          <tbody>
            <tr><th scope="row">0</th><td>0–31</td><td>All 32</td></tr>
            <tr><th scope="row">1</th><td>32–63</td><td>Thread 0</td></tr>
          </tbody>
        </table>
      </div>
      <p>Thread 0 in Block 1 writes out[32]. The other 31 threads in Block 1 skip the array accesses.</p>
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
      <p>Each sector holds eight four-byte values. The two arrays start on sector boundaries in the browser model.</p>
    </figure>`,
  reduction: `
    <figure class="concept-diagram">
      <figcaption>How the first block combines values 1 through 8</figcaption>
      <ol class="diagram-flow">
        <li><strong>Distance 4</strong><span>Four partial sums<br>[6, 8, 10, 12]</span></li>
        <li><strong>Distance 2</strong><span>Two partial sums<br>[16, 20]</span></li>
        <li><strong>Distance 1</strong><span>One sum<br>36 → out[0]</span></li>
      </ol>
      <p>Every step waits for the previous writes at a block barrier. At distance 4, Thread 1 adds its 2 to the 6 in scratch[5].</p>
    </figure>`,
  transfers: `
    <figure class="concept-diagram">
      <figcaption>Array copies for 33 float32 values per array</figcaption>
      <ol class="diagram-flow">
        <li><strong>Host → GPU</strong><span>Upload x and y<br>132 bytes each</span></li>
        <li><strong>GPU</strong><span>Compute out<br>66 reads, 33 writes</span></li>
        <li><strong>GPU → host</strong><span>Download out<br>132 bytes</span></li>
      </ol>
      <p>These byte counts assume the inputs start on the host and the host needs the output. The browser Console counts the array accesses in the middle step.</p>
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
