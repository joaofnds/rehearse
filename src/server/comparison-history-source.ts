import { realpath } from "node:fs/promises";
import { dirname, relative } from "node:path";

import { z } from "zod";

import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import StaleComparisonHistoryError from "#server/comparison-history-contract";
import type {
	ComparisonAttemptHistoryLink,
	ComparisonAttemptLinkRequest,
} from "#server/comparison-history-contract";

import { readRecordedEvidenceFile } from "./session-history-reader";

function sha256(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

async function sameRealPath(
	actual: string,
	expected: string,
): Promise<boolean> {
	try {
		return actual === (await realpath(expected));
	} catch (error) {
		const parsed = z.object({ code: z.string() }).loose().safeParse(error);
		if (
			parsed.success &&
			(parsed.data.code === "ENOENT" || parsed.data.code === "ENOTDIR")
		) {
			return false;
		}
		throw error;
	}
}

interface ComparedAttemptSources {
	readonly groupSource: Awaited<ReturnType<typeof readRecordedEvidenceFile>>;
	readonly repSource: Awaited<ReturnType<typeof readRecordedEvidenceFile>>;
	readonly attemptSource: Awaited<ReturnType<typeof readRecordedEvidenceFile>>;
	readonly group: ReturnType<typeof parseConfirmationGroupRecord>;
	readonly rep: ReturnType<typeof parseConfirmationRepRecord>;
	readonly attempt: ReturnType<typeof parseSessionAttemptRecord>;
}

async function comparedAttemptSources(
	request: ComparisonAttemptLinkRequest,
): Promise<ComparedAttemptSources> {
	const groupSource = await readRecordedEvidenceFile(
		request.runsDirectory,
		request.group.path,
	);
	const repSource = await readRecordedEvidenceFile(
		request.runsDirectory,
		request.rep.path,
	);
	const attemptSource = await readRecordedEvidenceFile(
		request.runsDirectory,
		request.rep.attempt.path,
	);
	if (
		sha256(groupSource.text) !== request.group.sha256 ||
		sha256(repSource.text) !== request.rep.sha256 ||
		sha256(attemptSource.text) !== request.rep.attempt.sha256
	) {
		throw new StaleComparisonHistoryError("digest mismatch");
	}

	const group = parseConfirmationGroupRecord(groupSource.text);
	const rep = parseConfirmationRepRecord(repSource.text);
	const attempt = parseSessionAttemptRecord(attemptSource.text);

	return { attempt, attemptSource, group, groupSource, rep, repSource };
}

async function sameRecordedIdentity(
	request: ComparisonAttemptLinkRequest,
	sources: ComparedAttemptSources,
): Promise<boolean> {
	const { groupSource, repSource, attemptSource, group, rep, attempt } =
		sources;

	const expected = confirmationGroupPaths(request.runsDirectory, group.groupId);
	const expectedRep = expected.rep(request.rep.repId);
	const owned = group.repRecords.some(
		(reference) =>
			reference.repId === request.rep.repId &&
			reference.ordinal === rep.ordinal &&
			reference.path === relative(dirname(groupSource.path), repSource.path),
	);

	return !(
		group.mode !== "session" ||
		rep.mode !== "session" ||
		group.caseId !== request.caseId ||
		rep.caseId !== request.caseId ||
		attempt.caseId !== request.caseId ||
		rep.groupId !== group.groupId ||
		rep.repId !== request.rep.repId ||
		!owned ||
		!(await sameRealPath(groupSource.path, expected.groupFile)) ||
		!(await sameRealPath(repSource.path, expectedRep.recordFile)) ||
		!(await sameRealPath(attemptSource.path, expectedRep.attemptFile))
	);
}

async function ownedComparisonHistoryLink(
	request: ComparisonAttemptLinkRequest,
): Promise<ComparisonAttemptHistoryLink> {
	const sources = await comparedAttemptSources(request);
	if (!(await sameRecordedIdentity(request, sources))) {
		throw new StaleComparisonHistoryError("identity mismatch");
	}

	return {
		groupId: sources.group.groupId,
		href: `/groups/${sources.group.groupId}/reps/${request.rep.repId}/attempt`,
		ordinal: request.rep.ordinal,
		repId: request.rep.repId,
		status: "available",
	};
}

export { ownedComparisonHistoryLink as default };
