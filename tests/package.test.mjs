// The npm package: its name, and its files are the files of the extension (as in the zip for addons.mozilla.org) — no
// tests, scripts, development files of the build or the zip itself.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { test } from "node:test";
import { promisify } from "node:util";
import { ROOT, extensionFiles, isDevelopmentFile, readJson } from "./helpers.mjs";

const execFileAsync = promisify(execFile);

test("the package name", () => {
	// npm does not allow capital letters in new package names; "imageinfo" is taken by another package.
	assert.equal(readJson("package.json").name, "imageinfo-extension");
});

test("the npm package has exactly the files of the extension", async () => {
	// npm is npm.cmd on Windows — Node runs it only through the shell.
	const { stdout } = await execFileAsync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: ROOT, shell: process.platform === "win32" });
	const [pack] = JSON.parse(stdout);
	const packed = pack.files.map((/** @type {{ path: string }} */ file) => file.path.replace(/\\/g, "/")).sort();
	const expected = [...extensionFiles().filter((path) => !isDevelopmentFile(path)), "package.json"].sort();
	assert.deepEqual(packed, expected);
});
