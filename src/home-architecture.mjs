// An original, static overview. Boxes represent concepts, not physical core counts.
export function homeArchitecture(language) {
  const python=language==='python';
  const launch=python?'kernel[1, 1](out)':'hello&lt;&lt;&lt;1, 1&gt;&gt;&gt;(output)';
  return `<figure class="home-architecture">
    <svg viewBox="0 0 480 320" role="img" aria-labelledby="home-map-title home-map-description">
      <title id="home-map-title">From a ${python?'Python':'C++'} program to GPU threads and back</title>
      <desc id="home-map-description">The CPU launches one GPU thread on the compute chip. The thread writes 42 to separate device memory, then the CPU copies the result back.</desc>
      <defs><marker id="home-map-arrow" markerUnits="userSpaceOnUse" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path class="home-map-arrowhead" d="M0 0 8 4 0 8Z"/></marker></defs>
      <rect class="home-map-boundary" x="12" y="12" width="150" height="296" rx="14"/>
      <text class="home-map-title" x="28" y="47">CPU · host</text>
      <rect class="home-map-surface" x="24" y="70" width="126" height="108" rx="8"/>
      <text class="home-map-label" x="38" y="104">${python?'Python':'C++'}</text>
      <text class="home-map-label" x="38" y="133">program</text>
      <text class="home-map-code" x="38" y="160">main()</text>
      <rect class="home-map-result" x="24" y="222" width="126" height="68" rx="8"/>
      <text class="home-map-label" x="38" y="249">Result</text>
      <text class="home-map-value" x="128" y="276" text-anchor="end">42</text>
      <rect class="home-map-boundary" x="272" y="12" width="196" height="296" rx="14"/>
      <text class="home-map-title" x="286" y="47">GPU · device</text>
      <rect class="home-map-chip" x="284" y="70" width="172" height="108" rx="8"/>
      <text class="home-map-label" x="298" y="101">Compute chip</text>
      <text class="home-map-small" x="298" y="126">One GPU thread</text>
      <g class="home-map-threads"><rect x="298" y="141" width="134" height="20" rx="3"/></g>
      <rect class="home-map-surface" x="284" y="222" width="172" height="68" rx="8"/>
      <text class="home-map-label" x="298" y="249">Device memory</text>
      <g class="home-map-memory"><rect x="298" y="263" width="34" height="12" rx="2"/><rect x="336" y="263" width="34" height="12" rx="2"/><rect x="374" y="263" width="34" height="12" rx="2"/><rect x="412" y="263" width="30" height="12" rx="2"/></g>
      <g class="home-map-flow" marker-end="url(#home-map-arrow)"><path d="M164 112H266"/><path d="M270 262H168"/><path d="M324 182V216"/></g>
      <text class="home-map-action" x="344" y="205">Write</text>
      <text class="home-map-action" x="216" y="98" text-anchor="middle">Launch</text>
      <text class="home-map-action" x="216" y="248" text-anchor="middle">Copy back</text>
    </svg>
    <p class="home-architecture-launch"><span>${python?'Python':'C++'} launch</span><code>${launch}</code></p>
    <figcaption>A kernel is a function that GPU threads run. The first lesson launches one thread to write 42 to device memory, then copies the result back to the CPU. The browser simulates this hardware.</figcaption>
  </figure>`;
}
