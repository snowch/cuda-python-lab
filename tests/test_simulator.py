import json
import subprocess
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))

from browser_adapter import CONSOLE_LIMIT, run_from_json
from simulator import run_lab


def starter_cases():
    return json.loads(subprocess.check_output(["node", ROOT / "scripts/test-cases.mjs"]))


class SimulatorTests(unittest.TestCase):
    def test_all_starters_match_their_reference_and_export_valid_python(self):
        for lesson in starter_cases():
            for case in lesson["cases"]:
                with self.subTest(lesson=lesson["slug"], fixture=case["fixture"]["label"]):
                    result = run_lab(lesson["source"], case["fixture"])
                    self.assertEqual(result["mismatches"], [])
                    self.assertTrue(result["events"])
                    for cell in case["notebook"]["cells"]:
                        if cell["cell_type"] == "code" and not cell["source"].startswith("%"):
                            compile(cell["source"], "exported-notebook.py", "exec")

    def test_barrier_requires_all_threads(self):
        source = """
from numba import cuda

@cuda.jit
def kernel(out):
    if cuda.threadIdx.x == 0:
        cuda.syncthreads()
    out[0] = 42
"""
        first_case = starter_cases()[0]["cases"][0]["fixture"]
        with self.assertRaisesRegex(RuntimeError, "reached different barriers"):
            run_lab(source, {**first_case, "threads": [2]})

    def test_edge_threads_surface_out_of_bounds_without_guard(self):
        vector = next(lesson for lesson in starter_cases() if lesson["slug"] == "vector-add")
        source = vector["source"].replace("    if i < n:\n    ", "")
        with self.assertRaisesRegex(IndexError, "outside shape"):
            run_lab(source, vector["cases"][0]["fixture"])

    def test_vector_boundary_thread_owns_index_32(self):
        vector = next(lesson for lesson in starter_cases() if lesson["slug"] == "vector-add")
        result = run_lab(vector["source"], vector["cases"][0]["fixture"])
        event, = [event for event in result["events"] if
                  event["action"] == "write" and event["index"] == 32]
        self.assertEqual((event["block"], event["thread"]), ((1, 0), (0, 0)))

    def test_browser_adapter_limits_console_output_without_altering_results(self):
        case = starter_cases()[0]["cases"][0]["fixture"]
        source = f"""def kernel(out):
    print("a" * {CONSOLE_LIMIT + 20})
    out[0] = 42
"""
        report = json.loads(run_from_json(source, json.dumps(case), "first-value.py"))
        self.assertEqual(report["stdout"], "a" * CONSOLE_LIMIT + "\n[Console output truncated.]")
        self.assertEqual(report["result"]["output"], [42])
