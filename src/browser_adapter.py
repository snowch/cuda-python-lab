"""Capture Python execution output for the browser workbench."""

from contextlib import redirect_stdout
from io import StringIO
import json
import traceback

from simulator import run_lab


CONSOLE_LIMIT = 16_384


class Console(StringIO):
    def __init__(self):
        super().__init__()
        self.truncated = False

    def write(self, text):
        remaining = CONSOLE_LIMIT - self.tell()
        super().write(text[:remaining])
        self.truncated |= len(text) > remaining
        return len(text)

    def output(self):
        text = self.getvalue()
        return text + "\n[Console output truncated.]" if self.truncated else text


def run_from_json(source, fixture, filename):
    console = Console()
    with redirect_stdout(console):
        try:
            report = {"result": run_lab(source, json.loads(fixture), filename)}
        except Exception:
            report = {"error": traceback.format_exc()}
    report["stdout"] = console.output()
    return json.dumps(report, allow_nan=False)
