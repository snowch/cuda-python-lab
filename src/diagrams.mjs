export const diagrams = {
  transfers: `
    <figure class="concept-diagram">
      <figcaption>Payload for 33 float32 elements per array</figcaption>
      <ol class="diagram-flow">
        <li><strong>Host → GPU</strong><span>Upload x and y<br>132 bytes each</span></li>
        <li><strong>GPU</strong><span>Compute out<br>66 reads, 33 writes</span></li>
        <li><strong>GPU → host</strong><span>Download out<br>132 bytes</span></li>
      </ol>
      <p>The arrows assume the inputs start and the output ends on the host. The browser shows the middle step’s logical accesses.</p>
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
