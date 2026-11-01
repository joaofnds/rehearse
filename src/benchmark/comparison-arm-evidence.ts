import { relative, resolve } from "node:path";

import type {
	DigestedComparisonRep,
	LoadedComparisonArmEvidence,
	LoadedComparisonArmGroups,
} from "./comparison-evidence";
import type { EvidenceFile, LoadArmRequest } from "./comparison-evidence-files";
import { evidenceError, readEvidenceFile } from "./comparison-evidence-files";
import type { VerifiedFrozenFiles } from "./comparison-frozen-evidence";
import { assertFrozenFiles } from "./comparison-frozen-evidence";
import type { ComparisonArm, ComparisonManifest } from "./comparison-record";
import loadRepRecords from "./comparison-rep-records";
import assertSessionFrozenFiles from "./comparison-session-frozen-inputs";
import type { DeclaredConfirmationGroup } from "./confirmation-record";
import {
	SESSION_CONFIRMATION_SCHEMA_VERSION,
	parseDeclaredConfirmationGroup,
} from "./confirmation-record";
import type { Immutable } from "./contracts";

interface ArmSourceEvidence {
	readonly declared: DeclaredConfirmationGroup;
	readonly frozen: VerifiedFrozenFiles;
	readonly groupPath: string;
	readonly source: Readonly<EvidenceFile>;
}

async function loadArm(
	request: Readonly<LoadArmRequest>,
): Promise<LoadedComparisonArmEvidence> {
	const groupPath = resolve(request.manifestDirectory, request.groupReference);
	const source = await readEvidenceFile({
		arm: request.role,
		caseId: request.caseId,
		field: "group.path",
		path: groupPath,
	});
	const declared = readConfirmationGroup(request, source);
	const group = declared.record;
	if (
		group.mode === "session" &&
		group.schemaVersion !== SESSION_CONFIRMATION_SCHEMA_VERSION
	) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: "group.mode" },
			"legacy session confirmation groups are not comparable; rerun with session evidence",
		);
	}
	const frozen = await assertFrozenFiles(request, groupPath, group);
	return await loadArmEvidence(request, {
		declared,
		frozen,
		groupPath,
		source,
	});
}

async function loadArmGroups(
	request: Readonly<Omit<LoadArmRequest, "groupReference">>,
	groupReferences: ComparisonManifest["cases"][number]["arms"][ComparisonArm],
): Promise<LoadedComparisonArmGroups> {
	const [first, ...rest] = groupReferences;
	if (first === undefined) {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: "group.path" },
			"the arm names no confirmation group",
		);
	}
	const groups: [
		LoadedComparisonArmEvidence,
		...LoadedComparisonArmEvidence[],
	] = [await loadArm({ ...request, groupReference: first })];
	await Array.fromAsync(rest, async (groupReference) => {
		groups.push(await loadArm({ ...request, groupReference }));
	});

	return groups;
}

function readConfirmationGroup(
	request: Readonly<LoadArmRequest>,
	source: Readonly<EvidenceFile>,
): DeclaredConfirmationGroup {
	try {
		return parseDeclaredConfirmationGroup(source.text);
	} catch {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field: "group.record" },
			"invalid confirmation group record",
		);
	}
}

function repSourcePaths(
	manifestDirectory: string,
	{
		attempt,
		finalJudge,
		scorecards,
		canonicalPath,
		path,
	}: Immutable<DigestedComparisonRep>,
): readonly string[] {
	const paths = [canonicalPath ?? resolve(manifestDirectory, path)];
	if (finalJudge?.canonicalPath !== undefined) {
		paths.push(finalJudge.canonicalPath);
	}
	if (attempt?.canonicalPath !== undefined) {
		paths.push(attempt.canonicalPath);
	}
	for (const scorecard of scorecards ?? []) {
		if (scorecard.canonicalPath !== undefined) {
			paths.push(scorecard.canonicalPath);
		}
	}
	return paths;
}

async function loadArmEvidence(
	request: Readonly<LoadArmRequest>,
	{ declared, frozen, groupPath, source }: Immutable<ArmSourceEvidence>,
): Promise<LoadedComparisonArmEvidence> {
	const group = declared.record;
	const session =
		group.mode === "session"
			? assertSessionFrozenFiles(request, group, frozen)
			: undefined;
	const reps = await loadRepRecords(
		request,
		{ group, groupPath },
		{
			frozenCorpus: session?.corpusFiles ?? [],
			sessionCase: session?.sessionCase,
		},
	);
	const loaded = {
		declaredCaseId: declared.declaredCaseId,
		frozenFiles: frozen.files,
		group: {
			canonicalPath: source.canonicalPath,
			path: relative(request.manifestDirectory, groupPath),
			record: group,
			sha256: source.sha256,
		},
		reps,
		role: request.role,
		sourcePaths: [
			source.canonicalPath,
			...reps.flatMap((rep) => repSourcePaths(request.manifestDirectory, rep)),
			...frozen.sourcePaths,
		],
	};
	if (session === undefined) {
		return loaded;
	}
	return { ...loaded, sessionCase: session.sessionCase };
}

export { loadArmGroups as default };
