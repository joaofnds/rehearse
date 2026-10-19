import type { FrozenFile } from "./comparison-evidence";
import type { LoadArmRequest } from "./comparison-evidence-files";
import { evidenceError } from "./comparison-evidence-files";
import { unhandled } from "./contracts";

const EMPTY_COLLECTION_LENGTH = 0;

type SessionFrozenFileKind = "case" | "fixture" | "transcript" | "corpus";

function sessionFrozenPath(
	request: Readonly<LoadArmRequest>,
	file: FrozenFile,
): string {
	if (!isSessionFrozenFileKind(file.kind)) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `inputs.files[${file.kind}:${file.path}]`,
			},
			`unsupported session frozen input kind ${file.kind}`,
		);
	}

	const prefix = sessionFrozenPrefix(file.kind);
	const normalized = file.path.replaceAll("\\", "/");
	if (!normalized.startsWith(prefix)) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `inputs.files[${file.kind}:${file.path}]`,
			},
			`session ${file.kind} input must be under ${prefix}`,
		);
	}

	const relativePath = normalized.slice(prefix.length);
	if (
		relativePath.length === EMPTY_COLLECTION_LENGTH ||
		relativePath
			.split("/")
			.some((segment) => segment === "" || segment === "." || segment === "..")
	) {
		throw evidenceError(
			{
				arm: request.role,
				caseId: request.caseId,
				field: `inputs.files[${file.kind}:${file.path}]`,
			},
			`session ${file.kind} input must name a file under ${prefix}`,
		);
	}

	return relativePath;
}

function isSessionFrozenFileKind(
	kind: FrozenFile["kind"],
): kind is SessionFrozenFileKind {
	return (
		kind === "case" ||
		kind === "fixture" ||
		kind === "transcript" ||
		kind === "corpus"
	);
}

function sessionFrozenPrefix(kind: SessionFrozenFileKind): string {
	switch (kind) {
		case "case": {
			return "inputs/";
		}
		case "fixture": {
			return "inputs/fixture/";
		}
		case "transcript": {
			return "inputs/transcript/";
		}
		case "corpus": {
			return "inputs/corpus/";
		}
		default: {
			return unhandled(kind, "session frozen file kind");
		}
	}
}

export { sessionFrozenPath as default };
