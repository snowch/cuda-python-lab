# CUDA Python Lab

Learn GPU programming through seventeen hands-on labs for Python developers. Edit the complete CUDA Python program, including the kernel and the host `main()`, then download a notebook and run it on an NVIDIA GPU. The course follows the predict, run, and explain format of [CUDA C++ Lab](https://snowch.github.io/cuda-cpp-lab/v2/).

## Take the course

1. Pick a lesson and, where available, a case. The editor shows the data, launch dimensions, kernel, and result copy for that case.
2. Select **Download notebook**. Open the file in Jupyter on a machine with an NVIDIA GPU, or upload it to [Google Colab](https://colab.research.google.com/) and select a GPU under **Runtime → Change runtime type**.
3. Run the notebook cells in order, including the dependency installation. Continue the experiment by editing and rerunning the program cell. Use **Check the output** to compare with the selected starter case.

Choose **Export .py** in **Editor tools** to run the complete program directly with Python. Use Python 3.12, an NVIDIA driver compatible with CUDA 12, and the dependencies in [requirements.txt](src/gpu/requirements.txt).

| Module | Labs |
| --- | --- |
| CUDA foundations | First kernel, bounds checks, grid-stride loops |
| Memory and execution | Host/device transfers, coalescing, warp divergence |
| Parallel patterns | Block reduction, atomic histogram, block scan |
| Reusing data and computing probabilities | Tiled transpose, tiled matrix multiplication, stable softmax |
| Design, debug, and tune kernels | Gather, shared-memory stencil, float32 rounding, synchronization debugging, fusion |

Diagrams and captioned walkthroughs show how the programs use threads, blocks, warps, and GPU memory. Appendix A includes an occupancy worksheet and [GPU investigations](src/gpu/INVESTIGATIONS.md) with Compute Sanitizer, profiling, and a fusion capstone.

## Develop and verify

Use Node.js 22 or later.

```sh
npm ci
npm run dev
```

Open [localhost:8000](http://localhost:8000). Predictions, source drafts, case selections, and completion are stored in the current browser. Use `npm run build` to create the static site in `dist/`.

`src/course.mjs` defines the lessons and cases. `src/kernels/` contains the kernels, `src/host-program.mjs` generates the host code, and `src/notebook.mjs` builds the notebook exports.

```sh
# Install Chromium for Playwright if a system Chromium is unavailable.
npx playwright-core install chromium
npm test

# Check exports with Numba's development simulator and compile PTX.
python -m venv .venv
source .venv/bin/activate
python -m pip install -r src/gpu/requirements.txt
python scripts/check_native.py
python scripts/check_native.py --ptx
```

The browser tests check the editor, case selection, saved drafts, exports, and walkthroughs. Development checks exercise the exported programs and notebooks. Hardware timing and behavior such as races require an NVIDIA GPU.

Walkthrough scripts and transcripts are in `src/walkthroughs.mjs`. The site build uses the checked-in media. To regenerate the videos, run `node scripts/build_walkthroughs.mjs /path/to/en_US-ljspeech-medium.onnx` with Chromium, FFmpeg, uv, and the [Piper voice model and its JSON config](https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech/medium). The narration uses a synthetic voice.
