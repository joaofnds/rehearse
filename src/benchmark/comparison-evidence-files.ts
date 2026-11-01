import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve, sep } from "node:path";

import ComparisonEvidenceError from "./comparison-evidence";
import type { ComparisonArm } from "./comparison-record";

interface EvidenceLocation {
	readonly caseId: string;
	readonly arm: ComparisonArm | "all";
	readonly field: string;
}

interface ReadEvidenceFileRequest extends EvidenceLocation {
	readonly path: string;
	readonly sourceRoot?: string | undefined;
}

interface EvidenceFile {
	readonly canonicalPath: string;
	readonly sha256: string;
	readonly text: string;
}

interface EvidencePathReference {
	readonly root: string;
	readonly path: string;
	readonly field: string;
}

interface SourcePath {
	readonly root: string;
	readonly path: string;
}

interface LoadArmRequest {
	readonly manifestDirectory: string;
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly groupReference: string;
}

function evidenceError(
	location: Readonly<EvidenceLocation>,
	message: string,
): ComparisonEvidenceError {
	return new ComparisonEvidenceError(
		`case ${location.caseId} arm ${location.arm} field ${location.field}: ${message}`,
	);
}

function sha256(bytes: Readonly<Uint8Array>): string {
	return createHash("sha256").update(bytes).digest("hex");
}

function descendantPath(
	request: Readonly<LoadArmRequest>,
	{ root, path, field }: EvidencePathReference,
): string {
	const absolute = resolve(root, path);
	if (!isDescendant({ path: absolute, root })) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field },
			"evidence path must remain inside its source directory",
		);
	}

	return absolute;
}

function isDescendant({ root, path }: SourcePath): boolean {
	const descendant = relative(root, path);

	return (
		descendant !== "" &&
		descendant !== ".." &&
		!descendant.startsWith(`..${sep}`) &&
		!isAbsolute(descendant)
	);
}

async function readEvidenceFile(
	request: Readonly<ReadEvidenceFileRequest>,
): Promise<EvidenceFile> {
	const file = Bun.file(request.path);
	if (!(await file.exists())) {
		throw evidenceError(request, `no file at ${request.path}`);
	}

	const canonicalPath = await realpath(request.path);
	if (
		request.sourceRoot !== undefined &&
		!isDescendant({
			path: canonicalPath,
			root: await realpath(request.sourceRoot),
		})
	) {
		throw evidenceError(
			request,
			"evidence path must remain inside its source directory",
		);
	}

	const sourceFile =
		request.sourceRoot === undefined ? file : Bun.file(canonicalPath);
	const bytes = await sourceFile.bytes();

	return {
		canonicalPath,
		sha256: sha256(bytes),
		text: new TextDecoder().decode(bytes),
	};
}

export { descendantPath, evidenceError, readEvidenceFile, sha256 };
export type { EvidenceFile, EvidenceLocation, LoadArmRequest };
