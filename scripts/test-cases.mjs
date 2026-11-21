import { readFile } from "node:fs/promises";
import { lessons } from "../src/course.mjs";
import { standaloneProgram } from "../src/host-program.mjs";
import { makeNotebook } from "../src/notebook.mjs";

const suite = await Promise.all(Object.entries(lessons).map(async ([slug, lesson]) => {
  const source = await readFile(new URL(`../src/kernels/${slug}.py`, import.meta.url), "utf8");
  return {
    slug, source,
    cases: lesson.cases.map((fixture) => ({
      fixture,
      notebook: makeNotebook(lesson, source, fixture),
      program: standaloneProgram(source, fixture),
    })),
  };
}));
console.log(JSON.stringify(suite));
