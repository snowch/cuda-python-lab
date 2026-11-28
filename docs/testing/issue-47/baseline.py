"""Run against the output of scripts/test-cases.mjs from the parent of this PR."""
import json
import sys
import numpy as np

with open(sys.argv[1]) as file:
    suite = json.load(file)
first = suite[0]["cases"][0]["notebook"]
second = suite[1]["cases"][1]["notebook"]
intro = second["cells"][0]["source"]
print("Second vector-add export:", intro.split("**Case** · ")[1].splitlines()[0])
print(next(line for line in intro.splitlines() if "To use another case" in line))
programs = [c for c in second["cells"] if c["cell_type"] == "code" and "def main():" in c["source"]]
assert len(programs) == 1
print("Full program cells:", len(programs))
print("First-value actual int32 [42], expected float32 [42]:")
exec(first["cells"][6]["source"], {"actual": np.array([42], dtype=np.int32)})
