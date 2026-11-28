
import { readFile } from "node:fs/promises";
import { lessons } from "../src/course.mjs";
import { standaloneProgram } from "../src/host-program.mjs";
import { makeNotebook } from "../src/notebook.mjs";

const runtime = await readFile(new URL("../src/notebook-runtime.py",import.meta.url),"utf8");
const suite = await Promise.all(Object.entries(lessons).map(async ([slug, lesson]) => {
  const source = await readFile(new URL(`../src/kernels/${slug}.py`, import.meta.url), "utf8");
  return {
    slug, source,
    cases: lesson.cases.map((fixture) => {
      const program = standaloneProgram(source, fixture);
      return { fixture, notebook: makeNotebook({slug, lesson, kernel:source, source:program, fixture, runtime}), program };
    }),
  };
}));
console.log(JSON.stringify(suite));
