"""CPU checks of exported notebooks and their reference logic; no GPU is simulated."""
import contextlib
import hashlib
import io
import json
from pathlib import Path
import subprocess
import runpy
import unittest

import nbformat
import numpy as np
from IPython.core.interactiveshell import InteractiveShell

ROOT = Path(__file__).resolve().parents[1]
SUITE = {l["slug"]: l for l in json.loads(subprocess.check_output(["node", "scripts/test-cases.mjs"], cwd=ROOT))}
LEDGER = [json.loads(line) for line in (ROOT / "docs/testing/issue-45/guided-runs.jsonl").read_text().splitlines()]


def setup(book):
    shell = InteractiveShell.instance()
    cell = next(c for c in book["cells"] if "setup" in c["metadata"].get("tags", []))
    with contextlib.redirect_stdout(io.StringIO()):
        result = shell.run_cell(cell["source"], store_history=False)
    result.raise_error()
    return shell.user_ns


def notebook(slug, index=0):
    return SUITE[slug]["cases"][index]["notebook"]


def check(ns, case, key, body, array, lines=()):
    with contextlib.redirect_stdout(io.StringIO()) as log:
        verdict = ns["assess"](case, key, body, array, lines)
    return verdict, log.getvalue()


def observed_array(ns, case, sample):
    # Simulator text records the values, not a binary dtype. Independent negative
    # tests supply genuinely wrong dtypes and shapes to the native checker.
    lines = sample["output"].splitlines()
    values = json.loads(lines[0].split(" = ", 1)[1].replace("nan", "NaN"))
    return np.array(values, dtype=ns["LAB"]["cases"][case]["dtype"]), lines


class NotebookTests(unittest.TestCase):
    def test_all_exports_and_complete_starting_sources(self):
        for slug, lesson in SUITE.items():
            for entry in lesson["cases"]:
                book, f = entry["notebook"], entry["fixture"]
                with self.subTest(slug=slug, selected=f["id"]):
                    nbformat.validate(nbformat.from_dict(book))
                    ns = setup(book)
                    catalog = ns["LAB"]
                    self.assertEqual(catalog["exportedCase"], f["id"])
                    programs = [c for c in book["cells"] if "cuda_lab" in c["metadata"]]
                    self.assertEqual(programs[0]["source"], f"%%experiment {slug} {f['id']} exported\n" + entry["program"])
                    cases = {e["fixture"]["id"] for e in lesson["cases"]}
                    self.assertEqual(set(catalog["cases"]), cases)
                    self.assertEqual({c["metadata"]["cuda_lab"]["case"] for c in programs}, cases)
                    for c in programs:
                        header, body = c["source"].split("\n", 1)
                        _, lesson_id, case, key = header.split()
                        self.assertEqual(lesson_id, slug)
                        self.assertEqual(c["metadata"]["cuda_lab"], {"case":case, "task":key})
                        self.assertEqual(body, ns["lab_start"](case, key))
                        compile(body, "<notebook-test>", "exec")
                    self.assertIn(f["label"], book["cells"][0]["source"])
        print("38/38 exports validated with nbformat; each exact selected program and every authored start compiled as Python.")

    def test_all_task_contracts_against_archived_simulator_observations(self):
        totals = {"pristine":0, "run":0, "reason":0}
        for slug, lesson in SUITE.items():
            ns = setup(notebook(slug))
            for row in (r for r in LEDGER if r["slug"] == slug):
                case, key = row["fixture"], row["task"]
                with self.subTest(slug=slug, case=case, key=key):
                    if key == "pristine":
                        body = ns["lab_start"](case, "starter")
                        sample = row
                        totals["pristine"] += 1
                        key = "starter"
                    else:
                        self.assertEqual(hashlib.sha256(ns["lab_start"](case, key).encode()).hexdigest(), row["startingSource"])
                        if "reasoning" in row:
                            self.assertEqual(ns["LAB"]["tasks"][key]["kind"], "reason")
                            self.assertFalse(any(c["metadata"].get("cuda_lab", {}).get("task") == key for c in notebook(slug)["cells"]))
                            totals["reason"] += 1
                            continue
                        body = ns["_target"](case, key)
                        sample = row["runs"][-1]
                        totals["run"] += 1
                    self.assertEqual(hashlib.sha256(body.encode()).hexdigest(), sample["sourceSha256"])
                    actual, lines = observed_array(ns, case, sample)
                    verdict, log = check(ns, case, key, body, actual, lines)
                    self.assertEqual(verdict, "observation" if key == "race" else "pass", log)
        self.assertEqual(totals, {"pristine":38, "run":46, "reason":12})
        print("CPU checker consumed 38 pristine and 46 authored target results from the archived GPGPU-Sim ledger; 12 tasks are source reasoning.")

    def test_all_starting_sources_against_simulator_observations(self):
        observations = {}
        for row in LEDGER:
            for run in ([row] if row["task"] == "pristine" else row["runs"]):
                identity = row["slug"], row["fixture"], run["sourceSha256"]
                observations.setdefault(identity, []).append(run)
        starts = set()
        phases = edited = runnable = 0
        for slug in SUITE:
            ns = setup(notebook(slug))
            for key, task in ns["LAB"]["tasks"].items():
                case = task["case"]
                body = ns["lab_start"](case, key)
                identity = slug, case, hashlib.sha256(body.encode()).hexdigest()
                with self.subTest(slug=slug, case=case, task=key):
                    samples = observations[identity]
                    starts.add(identity)
                    phases += 1
                    if task["kind"] == "reason":
                        continue
                    runnable += 1
                    if body == ns["_target"](case, key):
                        expected = "observation" if task["objective"]["policy"] == "race" else "pass"
                    else:
                        edited += 1
                        expected = "starting-observation" if task["startingObjective"]["policy"] == "race" else "starting-point"
                    for sample in samples:
                        actual, lines = observed_array(ns, case, sample)
                        verdict, report = check(ns, case, key, body, actual, lines)
                        self.assertEqual(verdict, expected, report)
        self.assertEqual((len(starts), phases, runnable, edited), (40, 58, 46, 20))
        print(f"{len(starts)} distinct starting sources matched archived simulator runs across {phases} phases. "
              f"Checked all {runnable} runnable starts, including {edited} with a different target.")

    def test_prerequisite_outputs_and_starting_race(self):
        ns = setup(notebook("first-value"))
        host = ns["lab_start"]("one", "host")
        for actual, expected in [
            (np.float32([73]), "starting-point"), (np.float32([42]), "starting-fail"),
            (np.int32([73]), "starting-fail"), (np.float32([[73]]), "starting-fail"),
            (np.float32([np.nan]), "starting-fail"), (None, "starting-fail"),
        ]:
            verdict, log = check(ns, "one", "host", host, actual)
            self.assertEqual(verdict, expected, log)
            self.assertNotIn("Numerical objective: pass", log)
        wrong_dtype = np.int32([42])
        self.assertEqual(check(ns, "one", "write", ns["lab_start"]("one", "write"), wrong_dtype)[0], "starting-fail")
        ns["LAB"]["selectedTask"] = "host"
        self.assertEqual(check(ns, "one", "exported", host, np.float32([42]))[0], "starting-fail")
        self.assertEqual(check(ns, "one", "host", host + "# independent edit", wrong_dtype)[0], "unassessed")

        ns = setup(notebook("softmax"))
        spec = ns["LAB"]["cases"]["extreme"]
        stable = np.array(spec["expected"], dtype=spec["dtype"]).reshape(spec["shape"])
        body = ns["lab_start"]("extreme", "overflow")
        for lines, expected in [
            (["out = ...", "[1. 1.]"], "starting-point"),
            (["out = ..."], "starting-fail"),
            (["out = ...", "[1. 0.]"], "starting-fail"),
            (["out = ...", "[nan nan]"], "starting-fail"),
        ]:
            self.assertEqual(check(ns, "extreme", "overflow", body, stable, lines)[0], expected)
        # Correct printed sums cannot rescue an incorrect returned array.
        self.assertEqual(check(ns, "extreme", "overflow", body, stable * 0, ["out = ...", "[1. 1.]"])[0], "starting-fail")

        ns = setup(notebook("histogram"))
        body = ns["lab_start"]("hot", "restore")
        for count in (1, 2, 32):
            verdict, log = check(ns, "hot", "restore", body, np.int32([0, 0, count, 0]))
            self.assertEqual(verdict, "starting-observation", log)
            self.assertNotIn("Numerical objective: pass", log)
        for bad in (np.int32([0, 0, 0, 0]), np.int32([1, 0, 2, 0]), np.float32([0, 0, 32, 0])):
            self.assertEqual(check(ns, "hot", "restore", body, bad)[0], "starting-fail")
        target = ns["_target"]("hot", "restore")
        self.assertEqual(check(ns, "hot", "restore", target, np.int32([0, 0, 32, 0]))[0], "pass")

    def test_hardware_verifier_requires_current_structured_verdict(self):
        # This exercises the hardware verifier's decision on CPU-supplied arrays.
        # No native preflight is overridden and no CUDA program is launched.
        verify = runpy.run_path(str(ROOT / "scripts/check_native.py"))["verify_program_cells"]
        book = notebook("first-value")
        ns = setup(book)
        cell = next(c for c in book["cells"] if c["metadata"].get("cuda_lab", {}).get("task") == "host")
        start = ns["lab_start"]("one", "host")
        observed = np.float32([42])

        def cpu_probe(source):
            body = source.split("\n", 1)[1]
            lines = ["out = [73.0]"] if body == start else ["out = [73.0]", "[0.0]"]
            with contextlib.redirect_stdout(io.StringIO()):
                ns["assess"]("one", "host", body, observed, lines)
            return "Starting result verified. Numerical objective: pass."

        with self.assertRaisesRegex(AssertionError, "starting-fail"):
            verify([cell], ns, cpu_probe, True)
        observed = np.float32([73])
        verify([cell], ns, cpu_probe, True)
        # A verified start followed by stdout alone must fail on the target.
        def skip_target(source):
            return cpu_probe(source) if source == cell["source"] else "Numerical objective: pass."

        with self.assertRaisesRegex(AssertionError, r"received \[\]"):
            verify([cell], ns, skip_target, True)

    def test_wrong_dimensions_dtype_values_and_custom_source(self):
        ns = setup(notebook("first-value"))
        body = ns["lab_start"]("one", "starter")
        for value in (np.array([42], dtype=np.int32), np.array([[42]], dtype=np.float32),
                      np.array([41], dtype=np.float32), np.array([np.nan], dtype=np.float32),
                      np.array([np.inf], dtype=np.float32), [42]):
            verdict, log = check(ns, "one", "starter", body, value)
            self.assertEqual(verdict, "fail", log)
            self.assertIn("Dtype:", log)
            self.assertIn("Shape:", log)
        actual = np.array([42], dtype=np.float32)
        custom = "import numpy as np\nactual = np.array([42], dtype=np.float32)"
        with contextlib.redirect_stdout(io.StringIO()):
            returned, lines = ns["execute_program"](custom)
        self.assertEqual(check(ns, "one", "exported", custom, returned, lines)[0], "unassessed")
        ns["LAB"]["selectedTask"] = "write"
        self.assertEqual(check(ns, "one", "exported", body, actual)[0], "starting-point")
        self.assertEqual(check(ns, "one", "write", body, actual)[0], "starting-point")
        self.assertEqual(check(ns, "one", "write", ns["_target"]("one", "write"), actual)[0], "fail")
        self.assertEqual(check(ns, "one", "host", ns["_target"]("one", "host"), np.float32([73]), ["out = [73]", "[9]"])[0], "fail")

    def test_numerical_policies(self):
        ns = setup(notebook("softmax"))
        spec = ns["LAB"]["cases"]["extreme"]
        ref = np.float32(spec["expected"]).reshape(spec["shape"])
        # The reference contains an underflowed zero. Exercise either side of its absolute tolerance.
        for delta, verdict in ((0.9e-7,"pass"), (1.1e-7,"fail")):
            candidate = ref.copy()
            candidate[0,4] = delta
            self.assertEqual(check(ns,"extreme","starter",spec["starter"],candidate)[0], verdict)
        key = "overflow"
        actual = np.float32([[np.nan,np.nan,np.nan,np.nan,0], [np.nan]*5])
        lines = ["out = ...", "[nan nan]", "False"]
        self.assertEqual(check(ns,"extreme",key,ns["_target"]("extreme",key),actual,lines)[0],"pass")
        for value in (np.inf, 0):
            altered = actual.copy()
            altered[0,0] = value
            self.assertEqual(check(ns,"extreme",key,ns["_target"]("extreme",key),altered,lines)[0],"fail")
        ns = setup(notebook("precision"))
        verdict, log = check(ns,"near","regroup",ns["_target"]("near","regroup"),np.float32([1,1]))
        self.assertEqual(verdict,"pass")
        self.assertIn("1/2 match",log)
        self.assertIn("Absolute error",log)
        ns = setup(notebook("histogram"))
        for count in [1, 9, 32]:
            self.assertEqual(check(ns,"hot","race",ns["_target"]("hot","race"),np.int32([0,0,count,0]))[0],"observation")
        self.assertEqual(check(ns,"hot","race",ns["_target"]("hot","race"),np.int32([9,0,2,0]))[0],"fail")

    def test_isolation_failure_case_switch_and_reset(self):
        ns = setup(notebook("softmax"))
        before = ns["lab_start"]("extreme","overflow")
        custom = "import numpy as np\nactual = np.array([17], dtype=np.int32)"
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(ns["execute_program"](custom)[0].tolist(), [17])
            with self.assertRaises(ZeroDivisionError):
                ns["execute_program"]("1 / 0")
            self.assertIsNone(ns["execute_program"]("pass")[0])
        with self.assertRaises(ValueError):
            ns["lab_start"]("wide-37","overflow")
        self.assertNotEqual(before, ns["lab_start"]("wide-37","lane"))
        self.assertEqual(before, ns["lab_start"]("extreme","overflow"))
        self.assertNotIn("actual", ns)
        self.assertEqual(ns["lab_start"]("extreme","exported"), SUITE["softmax"]["cases"][0]["program"])


if __name__ == "__main__":
    unittest.main(verbosity=2)
