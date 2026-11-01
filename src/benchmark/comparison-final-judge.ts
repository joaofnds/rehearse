import { dirname, relative } from "node:path";

import { z } from "zod";

import type { DigestedRecord } from "./comparison-evidence";
import type { LoadArmRequest } from "./comparison-evidence-files";
import {
	descendantPath,
	evidenceError,
	readEvidenceFile,
} from "./comparison-evidence-files";
import type { ParsedConfirmationRepRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import judgeContractSha256Schema from "./judge-contract-schema";

const finalJudgeIdentitySchema = z.looseObject({
	judgeContractSha256: judgeContractSha256Schema.optional(),
});
type FinalJudgeIdentity = Immutable<z.infer<typeof finalJudgeIdentitySchema>>;

interface FinalJudgeLocation {
	readonly field: string;
	readonly repPath: string;
}

async function loadFinalJudge(
	request: Readonly<LoadArmRequest>,
	record: Immutable<ParsedConfirmationRepRecord>,
	location: FinalJudgeLocation,
): Promise<DigestedRecord<FinalJudgeIdentity> | undefined> {
	if (record.mode !== "pipeline" || record.finalOutcome.status !== "JUDGED") {
		return undefined;
	}

	const field = `${location.field}.finalOutcome.evidence.recordFile`;
	const path = descendantPath(request, {
		field,
		path: record.finalOutcome.evidence.recordFile,
		root: dirname(location.repPath),
	});
	const source = await readEvidenceFile({
		arm: request.role,
		caseId: request.caseId,
		field,
		path,
		sourceRoot: dirname(location.repPath),
	});
	const parsed = parseIdentity(source.text, request, field);

	return {
		canonicalPath: source.canonicalPath,
		path: relative(request.manifestDirectory, path),
		record: parsed,
		sha256: source.sha256,
	};
}

function parseIdentity(
	text: string,
	request: Readonly<LoadArmRequest>,
	field: string,
): FinalJudgeIdentity {
	try {
		return finalJudgeIdentitySchema.parse(JSON.parse(text));
	} catch {
		throw evidenceError(
			{ arm: request.role, caseId: request.caseId, field },
			"invalid final Judge identity record",
		);
	}
}

export { loadFinalJudge as default };
export type { FinalJudgeIdentity };
