"""Run real exported checkers in a Jupyter kernel with explicit CPU test inputs."""
import argparse
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from nbconvert import HTMLExporter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("downloads", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)

# The report is deliberately separate from the learner's notebook. Keep the
# published setup intact, including its hardware gate. No program cell is launched.
sections = [
    ("first-value", "A prerequisite can differ from the original starter", '''
case, task = "one", "host"
body = lab_start(case, task)
for value, expected in [(42, "starting-fail"), (73, "starting-point")]:
    print(f"CPU input: float32 [{value}]")
    verdict = assess(case, task, body, np.float32([value]), [f"out = [{value}.0]"])
    assert verdict == expected
    print()
'''),
    ("softmax", "The starting program must print the measured row sums", '''
case, task = "extreme", "overflow"
body = lab_start(case, task)
fixture = LAB["cases"][case]
array = np.array(fixture["expected"], dtype=fixture["dtype"]).reshape(fixture["shape"])
for sums, expected in [("[1. 1.]", "starting-point"), ("[1. 0.]", "starting-fail")]:
    print("CPU input: stable fixture probabilities with host print", sums)
    assert assess(case, task, body, array, ["out = ...", sums]) == expected
    print()
'''),
    ("histogram", "Restoring atomic addition changes what can be verified", '''
case, task = "hot", "restore"
for body, counts, expected in [
    (lab_start(case, task), [0, 0, 2, 0], "starting-observation"),
    (lab_start(case, task), [1, 0, 2, 0], "starting-fail"),
    (_target(case, task), [0, 0, 32, 0], "pass"),
]:
    print("CPU counter input:", counts)
    assert assess(case, task, body, np.int32(counts), []) == expected
    print()
'''),
]
cells = [nbformat.v4.new_markdown_cell(
    "# Guided starting results\n\nCPU checker inspection in a local Jupyter kernel. "
    "The arrays below are test inputs. No CUDA kernel is launched."
)]
for slug, heading, code in sections:
    source = nbformat.read(args.downloads / f"{slug}.ipynb", as_version=4)
    setup = next(c for c in source.cells if "setup" in c.metadata.get("tags", []))
    cells.extend([setup, nbformat.v4.new_markdown_cell("## " + heading),
                  nbformat.v4.new_code_cell("import numpy as np\n" + code.strip())])
book = nbformat.v4.new_notebook(cells=cells)
NotebookClient(book, kernel_name="python3", timeout=60).execute()
for index, (slug, heading, _) in enumerate(sections):
    output = "".join(o.text for o in book.cells[3 + index * 3].outputs if o.output_type == "stream")
    print(heading, output.rstrip(), sep="\n")
renderer = HTMLExporter(template_name="lab", exclude_input=True, exclude_output_prompt=True)
# Include only checker output, with the visible CPU label and the section headings.
book.cells = [c for c in book.cells if "setup" not in c.metadata.get("tags", [])]
html, _ = renderer.from_notebook_node(book)
(args.output / "starting-results.html").write_text(html)
