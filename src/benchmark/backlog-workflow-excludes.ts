import { resolve, sep } from "node:path";

import {
	appendExcludePatterns,
	readExcludePatterns,
} from "./backlog-excludes-io";
import { git } from "./target";
import { managedWorkflowPaths } from "./workflow-state";

const EMPTY_COLLECTION_LENGTH = 0;
const GITIGNORE_SPECIAL_CHARACTERS = new Set(["\\", "*", "?", "[", "]"]);

function workflowExcludePattern(path: string): string {
	const normalized = path.split(sep).join("/");
	if (normalized.includes("\n") || normalized.includes("\r")) {
		throw new Error("Backlog directory must fit on one Git exclude line");
	}

	let escaped = "";
	for (const character of normalized) {
		if (GITIGNORE_SPECIAL_CHARACTERS.has(character)) {
			escaped += "\\";
		}
		escaped += character;
	}

	return `/${escaped}${normalized === "backlog.config.yml" ? "" : "/"}`;
}

/**
 * The harness owns its board scaffolding but not the target's `.gitignore`.
 * Repository-private excludes keep a previously boardless target clean without
 * changing the files a stage is measured against or depending on global Git
 * configuration.
 */
async function excludeWorkflowState(targetDir: string): Promise<void> {
	const commonDirectory = await git(targetDir, "rev-parse", "--git-common-dir");
	const excludePath = resolve(targetDir, commonDirectory, "info", "exclude");
	const existing = await readExcludePatterns(excludePath);
	const paths = await managedWorkflowPaths(targetDir);
	const patterns = [
		...new Set(paths.map((path) => workflowExcludePattern(path))),
	];
	const lines = new Set(
		existing
			.toString("utf8")
			.split("\n")
			.map((line) => line.replace(/\r$/u, "")),
	);
	const missing = patterns.filter((path) => !lines.has(path));
	if (missing.length === EMPTY_COLLECTION_LENGTH) {
		return;
	}

	await appendExcludePatterns({ excludePath, existing, missing });
}

export { excludeWorkflowState as default };
