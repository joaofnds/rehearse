import { createHash } from "node:crypto";
import { dirname, join } from "node:path";

import { parseCaseDeclaration } from "./case";
import type { ComparisonArm } from "./comparison-record";
import type { SessionConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import { confirmationGroupPaths } from "./run-layout";
import { readSessionGroup } from "./session-comparison-record-reader-fixture";
import { JSON_INDENTATION_SPACES } from "./session-comparison-test-contract";
import type { SharedSessionCaseField } from "./session-comparison-test-contract";

function digest(text: string): string {
	return createHash("sha256").update(text).digest("hex");
}

interface SessionGroupLookup {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly role: ComparisonArm;
}

function sessionGroupFile({
	runsDirectory,
	caseId,
	role,
}: SessionGroupLookup): string {
	return confirmationGroupPaths(runsDirectory, `${caseId}-${role}`).groupFile;
}

async function updateFrozenCase(
	groupFile: string,
	change: (
		declaration: ReturnType<typeof parseCaseDeclaration>,
	) => ReturnType<typeof parseCaseDeclaration>,
): Promise<void> {
	const group = await readSessionGroup(groupFile);

	const frozenCase = group.inputs.files.find(({ kind }) => kind === "case");
	if (frozenCase === undefined) {
		throw new Error("session fixture group has no frozen case file");
	}

	const casePath = join(dirname(groupFile), frozenCase.path);
	const declaration = parseCaseDeclaration(
		group.caseId,
		await Bun.file(casePath).text(),
	);
	const changedDeclaration = change(declaration);
	const changedText = `${JSON.stringify(changedDeclaration, null, JSON_INDENTATION_SPACES)}\n`;

	await Bun.write(casePath, changedText);

	await Bun.write(
		groupFile,
		`${JSON.stringify(
			{
				...group,
				inputs: {
					...group.inputs,
					files: group.inputs.files.map((file) =>
						file.kind === "case"
							? {
									kind: file.kind,
									path: file.path,
									sha256: digest(changedText),
								}
							: file,
					),
				},
			},
			null,
			JSON_INDENTATION_SPACES,
		)}\n`,
	);
}

async function updateSessionGroupInputs(
	groupFile: string,
	change: (
		inputs: Immutable<SessionConfirmationGroupRecord["inputs"]>,
	) => Immutable<SessionConfirmationGroupRecord["inputs"]>,
): Promise<void> {
	const group = await readSessionGroup(groupFile);

	await Bun.write(
		groupFile,
		`${JSON.stringify({ ...group, inputs: change(group.inputs) }, null, JSON_INDENTATION_SPACES)}\n`,
	);
}

function changedSessionCase(
	field: SharedSessionCaseField,
	declaration: ReturnType<typeof parseCaseDeclaration>,
): ReturnType<typeof parseCaseDeclaration> {
	if (declaration.kind !== "session") {
		throw new Error("expected a session case");
	}

	switch (field) {
		case "tools": {
			return { ...declaration, tools: ["Read"] };
		}
		case "settings": {
			return { ...declaration, settings: { mode: "strict" } };
		}
		case "agents": {
			return { ...declaration, agents: { reviewer: "sonnet" } };
		}
		case "projectFiles": {
			return { ...declaration, projectFiles: ["README.md"] };
		}
		case "checks": {
			return {
				...declaration,
				checks: [
					{ kind: "tool-calls", max: 0 },
					{ kind: "word-band", max: 1 },
				],
			};
		}
		case "stateCheck": {
			return {
				...declaration,
				stateCheck: {
					command: ["bun", "run", "score-state.ts"],
					outcomes: ["tree-clean"],
				},
			};
		}
		default: {
			throw new Error("Unhandled shared session case field");
		}
	}
}

export {
	digest,
	sessionGroupFile,
	updateFrozenCase,
	updateSessionGroupInputs,
	changedSessionCase,
};
