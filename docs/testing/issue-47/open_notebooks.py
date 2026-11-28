"""Open browser downloads with nbformat and a real Jupyter kernel on the no-GPU verification host."""
import argparse
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from nbconvert import HTMLExporter

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("books", type=Path)
parser.add_argument("output", type=Path)
args = parser.parse_args()
args.output.mkdir(parents=True, exist_ok=True)
renderer = HTMLExporter(template_name="lab")
books = sorted(args.books.glob("*.ipynb"))
assert len(books) == 17
for path in books:
    book = nbformat.read(path, as_version=4)
    nbformat.validate(book)
    html, _ = renderer.from_notebook_node(book)
    (args.output / (path.stem + ".html")).write_text(html)
    annotated = nbformat.from_dict(book)
    # Run the published setup and the actual export cell. On this host the latter
    # must stop at preflight. Never disable the guard to manufacture a native run.
    annotated.cells = annotated.cells[:5]
    probe = nbformat.v4.new_code_cell('''assert not NATIVE_READY
print("CPU-only isolation check")
value, _ = execute_program("import numpy as np\\nactual = np.array([42], dtype=np.int32)")
print("Observed CPU array:", value.shape, value.dtype, value.tolist())
try:
    execute_program("raise RuntimeError('deliberate CPU failure')")
except RuntimeError:
    assert execute_program("pass")[0] is None
print("No previous actual survived failure and rerun.")''')
    annotated.cells.append(probe)
    NotebookClient(annotated, kernel_name="python3", timeout=60, allow_errors=True).execute()
    errors = [o for c in annotated.cells if c.cell_type == "code" for o in c.outputs if o.output_type == "error"]
    assert len(errors) == 1 and errors[0].ename == "RuntimeError" and "Native preflight did not pass" in errors[0].evalue, (path,errors)
    assert not any(o.output_type == "error" for o in annotated.cells[-1].outputs)
    sizes = {c.metadata.cuda_lab.case for c in book.cells if "cuda_lab" in c.metadata}
    print(f"{path.stem}: opened {len(book.cells)} cells, {len(sizes)} fixtures; actual IPython setup ran; native execution stopped at the missing-driver gate; CPU isolation passed.", flush=True)
    if path.stem == "softmax":
        (args.output / "jupyter-preflight.log").write_text("".join(
            o.get("text","") or (o.ename + ": " + o.evalue + "\n" if o.output_type=="error" else "")
            for c in annotated.cells if c.cell_type=="code" for o in c.outputs))
