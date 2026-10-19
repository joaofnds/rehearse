import { isAbsolute, join, resolve } from "node:path";

import { CaseDeclarationError } from "./case-declaration";
import type {
	CaseDeclaration,
	PipelineCaseDeclaration,
} from "./case-declaration";
import { CONTROL_DIR } from "./config";
import { DEFAULT_STAGE_SETTINGS_FILE } from "./stage-settings";

const CASES_DIRECTORY = "cases";

/**
 * Cases live in the control repository, and the tests that write a case must
 * not write into the one the suite is running from: a probe left behind by a
 * failure would then be listed by every later `case list`. The root is a
 * parameter so a test can own a directory of its own.
 */
function casesRoot(): string {
	return join(CONTROL_DIR, CASES_DIRECTORY);
}

function caseDirectory(id: string, root: string = casesRoot()): string {
	return join(root, id);
}

/**
 * A declaration is untrusted data, so a path it names is confined to the one
 * directory that path's kind may reach before anything opens it. `resolve`
 * folds away `..` and absolute paths alike, so the containment is decided on
 * the resolved path rather than on the text the declaration carried.
 */
function confinedTo(directory: string, path: string, refusal: string): string {
	const absolute = resolve(directory, path);
	if (!absolute.startsWith(`${directory}/`)) {
		throw new CaseDeclarationError(refusal);
	}

	return absolute;
}

function caseRelative(
	declaration: CaseDeclaration,
	path: string,
	root: string = casesRoot(),
): string {
	return confinedTo(
		caseDirectory(declaration.id, root),
		path,
		`Case ${declaration.id} names a path outside its case directory: ${path}`,
	);
}

function caseDeclarationPath(id: string, root: string = casesRoot()): string {
	return join(caseDirectory(id, root), "case.json");
}

/**
 * The target is the one declared path that may name a repository outside the
 * case directory, so it is resolved against that directory rather than confined
 * to it by `caseRelative`. The base is the case directory all the same: one
 * base for every path in a declaration.
 */
function declaredTarget(declaration: PipelineCaseDeclaration): string {
	const { path } = declaration.target;
	if (isAbsolute(path)) {
		return path;
	}

	return resolve(caseDirectory(declaration.id), path);
}

/**
 * The settings file is harness-owned data, not a copy of anything live, so a
 * case that names none gets the harness's own default rather than an absent
 * settings surface: every stage session has one to read. Exported so replay,
 * which reads a case declaration directly rather than loading a full
 * BenchmarkCase, resolves the same path a run would.
 */
function declaredSettingsFilePath(
	declaration: PipelineCaseDeclaration,
): string {
	if (declaration.settingsFile === undefined) {
		return join(CONTROL_DIR, DEFAULT_STAGE_SETTINGS_FILE);
	}

	return caseRelative(declaration, declaration.settingsFile);
}

function transcriptPrefixPath(
	caseId: string,
	file: string,
	root: string = casesRoot(),
): string {
	return confinedTo(
		caseDirectory(caseId, root),
		file,
		`Case ${caseId} names a transcript outside its case directory: ${file}`,
	);
}

export {
	CASES_DIRECTORY,
	casesRoot,
	caseRelative,
	caseDeclarationPath,
	declaredTarget,
	declaredSettingsFilePath,
	transcriptPrefixPath,
};
