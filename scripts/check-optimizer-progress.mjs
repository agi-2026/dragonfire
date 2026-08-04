import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const html = await readFile(new URL("index.html", root), "utf8");
const css = await readFile(new URL("product.css", root), "utf8");

assert.match(html, /id="optimizerProgress"[^>]+role="status"[^>]+aria-live="polite"/);
assert.match(html, /role="progressbar"[^>]+aria-valuemin="0"[^>]+aria-valuemax="100"[^>]+aria-valuenow="0"/);
assert.match(html, /async function buildCandidatesWithProgress\(/);
assert.match(html, /await optimizerYield\(\)/);
assert.match(html, /async function optimize\(\)/);
assert.match(html, /button\.disabled=true/);
assert.match(css, /\.optimizer-progress-track/);

console.log("Optimizer progress valid: accessible progressbar, staged async yielding, and duplicate-run protection encoded.");
