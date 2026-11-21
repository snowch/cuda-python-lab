"""Serve the workbench and a CPU-only, process-isolated Numba compiler on Linux."""

import argparse
from functools import lru_cache, partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import shutil
import subprocess
import sys
from threading import BoundedSemaphore
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
COMPILER = Path(__file__).with_name("compile_kernel.py").resolve()
MAX_BODY = 65536
BUILD_TIMEOUT = 15
COMPILE_SLOTS = BoundedSemaphore(2)


def sandbox_command():
    executable = shutil.which("bwrap")
    if not executable:
        raise RuntimeError("Install bubblewrap (bwrap) to start the compiler.")
    command = [executable, "--unshare-all", "--die-with-parent", "--new-session", "--clearenv",
               "--setenv", "PATH", "/usr/bin", "--setenv", "OPENBLAS_NUM_THREADS", "1",
               "--setenv", "OMP_NUM_THREADS", "1", "--setenv", "PYTHONDONTWRITEBYTECODE", "1",
               "--tmpfs", "/tmp", "--dev", "/dev", "--proc", "/proc"]
    paths = ["/usr", "/lib", "/lib64", sys.base_prefix, sys.prefix]
    for index, path in enumerate(paths):
        if Path(path).exists() and not any(Path(path).is_relative_to(parent) for parent in paths[:index]):
            command += ["--ro-bind", path, path]
    python = Path(sys.executable).absolute()
    return [*command, "--ro-bind", str(COMPILER), "/compile_kernel.py", "--chdir", "/tmp", str(python), "-I", "/compile_kernel.py"]


@lru_cache(maxsize=64)
def compile_kernel(payload):
    if not COMPILE_SLOTS.acquire(blocking=False):
        raise RuntimeError("The compiler is busy. Try again in a moment.")
    try:
        process = subprocess.run(sandbox_command(), input=payload, capture_output=True, timeout=BUILD_TIMEOUT)
    finally:
        COMPILE_SLOTS.release()
    if process.returncode:
        raise RuntimeError("The compiler could not finish this kernel within its resource limits.")
    result = json.loads(process.stdout)
    if "error" in result:
        raise ValueError(result["error"])
    return result


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, origins, **kwargs):
        self.origins = origins
        super().__init__(*args, **kwargs)

    def setup(self):
        self.request.settimeout(20)
        super().setup()

    def end_headers(self):
        origin = self.headers.get("Origin")
        if origin in self.origins:
            self.send_header("Access-Control-Allow-Origin", origin)
            self.send_header("Vary", "Origin")
        super().end_headers()

    def json_response(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if urlsplit(self.path).path == "/compiler-config.json":
            self.json_response(200, {"url": "./api/compile"})
        else:
            super().do_GET()

    def do_OPTIONS(self):
        if urlsplit(self.path).path != "/api/compile" or self.headers.get("Origin") not in self.origins:
            self.send_error(403)
            return
        self.send_response(204)
        self.send_header("Access-Control-Allow-Methods", "POST")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if urlsplit(self.path).path != "/api/compile":
            self.json_response(404, {"error": "Compiler endpoint not found."})
            return
        if self.headers.get("Content-Type", "").split(";", 1)[0].strip().lower() != "application/json":
            self.json_response(415, {"error": "Send an application/json request."})
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            length = 0
        if not 0 < length <= MAX_BODY:
            self.json_response(413, {"error": "The compiler request must fit within 64 KiB."})
            return
        try:
            raw = json.loads(self.rfile.read(length))
            if not isinstance(raw, dict):
                raise ValueError("Send a kernel request object.")
            payload = json.dumps({key: raw.get(key) for key in ("source", "kernel", "signature")},
                                 sort_keys=True, separators=(",", ":")).encode()
            result = compile_kernel(payload)
        except (ValueError, RecursionError) as error:
            self.json_response(422, {"error": str(error)[:3000]})
            return
        except subprocess.TimeoutExpired:
            self.json_response(504, {"error": "Compilation timed out. Try a smaller kernel."})
            return
        except (RuntimeError, OSError):
            self.json_response(503, {"error": "The isolated compiler could not finish the request."})
            return
        self.json_response(200, result)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--origin", action="append", default=[], help="Allow this site origin to call the compiler.")
    args = parser.parse_args()
    directory = ROOT / "dist"
    if not (directory / "index.html").exists():
        parser.error("Build the site with npm run build first.")
    try:
        request = {"kernel": "probe", "source": "def probe(out): out[0] = 1",
                   "signature": [{"dtype": "float32", "ndim": 1}]}
        compile_kernel(json.dumps(request).encode())
    except (RuntimeError, ValueError, OSError, subprocess.TimeoutExpired) as error:
        parser.error(f"Compiler startup check failed. {error}")
    handler = partial(Handler, directory=directory, origins=set(args.origin))
    with ThreadingHTTPServer((args.bind, args.port), handler) as server:
        print(f"CUDA Python Lab at http://{args.bind}:{server.server_port}/", flush=True)
        server.serve_forever()


if __name__ == "__main__":
    main()
