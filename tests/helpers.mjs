// Shared helpers of the tests: paths of the extension files and reading them.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = fileURLToPath(new URL("..", import.meta.url));

// Directories of the repository — not part of the extension. dist/ holds the zip for addons.mozilla.org.
const TOOLING_DIRS = new Set([".git", ".github", ".githooks", "node_modules", "coverage", "web-ext-artifacts", "scripts", "tests", "dist"]);

// Files of the repository in its root — not part of the extension.
const TOOLING_FILES = new Set([".gitignore", "package.json", "package-lock.json", "SECURITY.md", "code_of_conduct.md"]);

// Development files of the build (types and editor settings) — in the repository, but not in the zip for addons.mozilla.org
// nor in the npm package.
const DEVELOPMENT_ROOT_FILES = new Set([".editorconfig", ".stylelintrc.json", "jsconfig.json", "AGENTS.md"]);

/**
 * Is the file (a path from the root, with "/") a development file of the build?
 * @param {string} path
 * @returns {boolean}
 */
export function isDevelopmentFile(path) {
	return path.endsWith(".globals.d.ts") || DEVELOPMENT_ROOT_FILES.has(path);
}

/**
 * Relative paths (with "/") of all files of the extension, the development files of the build included.
 * @returns {string[]}
 */
export function extensionFiles() {
	/** @type {string[]} */
	const files = [];
	/** @param {string} dir */
	const walk = (dir) => {
		for (const entry of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
			const path = dir ? `${dir}/${entry.name}` : entry.name;
			if (entry.isDirectory()) {
				if (!TOOLING_DIRS.has(entry.name)) walk(path);
			} else if (dir || !TOOLING_FILES.has(entry.name)) {
				files.push(path);
			}
		}
	};
	walk("");
	return files;
}

/**
 * @param {string} path relative to the root of the repository
 * @returns {string}
 */
export function readText(path) {
	return readFileSync(join(ROOT, path), "utf8");
}

/**
 * @param {string} path relative to the root of the repository
 * @returns {any}
 */
export function readJson(path) {
	return JSON.parse(readText(path));
}

/**
 * @param {string} path relative to the root of the repository
 * @returns {boolean}
 */
export function exists(path) {
	return existsSync(join(ROOT, path));
}
