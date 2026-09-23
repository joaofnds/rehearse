import { realpath } from "node:fs/promises";
import { dirname, relative } from "node:path";
import { z, ZodError } from "zod";
import {
	parseConfirmationGroupRecord,
	parseConfirmationRepRecord,
} from "#benchmark/confirmation-record";
import type {
	ComparisonArm,
	ComparisonReport,
	LegacyComparisonReport,
} from "#benchmark/comparison-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import {
	readRecordedEvidenceFile,
	SessionHistoryReaderError,
} from "./session-history-reader";

export type ComparisonAttemptHistoryLink =
	| {
			readonly status: "available";
			readonly repId: string;
			readonly ordinal: number;
			readonly href: string;
	  }
	| {
			readonly status: "stale";
			readonly repId: string;
			readonly ordinal: number;
	  };

export type ComparisonAttemptHistoryLinks = Readonly<
	Record<
		string,
		Readonly<Record<ComparisonArm, readonly ComparisonAttemptHistoryLink[]>>
	>
>;

interface DigestedPath {
	readonly path: string;
	readonly sha256: string;
}

interface ComparisonAttemptLinkRequest {
	readonly runsDirectory: string;
	readonly caseId: string;
	readonly group: DigestedPath;
	readonly rep: DigestedPath & {
		readonly repId: string;
		readonly ordinal: number;
		readonly attempt: DigestedPath;
	};
}

function sha256(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

class StaleComparisonHistoryError extends Error {
	public override name = "StaleComparisonHistoryError";
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

export async function comparisonAttemptHistoryLink(
	request: ComparisonAttemptLinkRequest,
): Promise<ComparisonAttemptHistoryLink> {
	try {
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
		const expected = confirmationGroupPaths(
			request.runsDirectory,
			group.groupId,
		);
		const expectedRep = expected.rep(request.rep.repId);
		const owned = group.repRecords.some(
			(reference) =>
				reference.repId === request.rep.repId &&
				reference.ordinal === request.rep.ordinal &&
				reference.path === relative(dirname(groupSource.path), repSource.path),
		);
		if (
			group.mode !== "session" ||
			rep.mode !== "session" ||
			group.caseId !== request.caseId ||
			rep.caseId !== request.caseId ||
			attempt.caseId !== request.caseId ||
			rep.groupId !== group.groupId ||
			rep.repId !== request.rep.repId ||
			rep.ordinal !== request.rep.ordinal ||
			!owned ||
			!(await sameRealPath(groupSource.path, expected.groupFile)) ||
			!(await sameRealPath(repSource.path, expectedRep.recordFile)) ||
			!(await sameRealPath(attemptSource.path, expectedRep.attemptFile))
		) {
			throw new StaleComparisonHistoryError("identity mismatch");
		}

		return {
			status: "available",
			repId: request.rep.repId,
			ordinal: request.rep.ordinal,
			href: `/groups/${group.groupId}/reps/${request.rep.repId}/attempt`,
		};
	} catch (error) {
		if (
			!(error instanceof StaleComparisonHistoryError) &&
			!(error instanceof SessionHistoryReaderError) &&
			!(error instanceof ZodError)
		) {
			throw error;
		}
		return {
			status: "stale",
			repId: request.rep.repId,
			ordinal: request.rep.ordinal,
		};
	}
}

export async function comparisonAttemptHistoryLinks(
	report: ComparisonReport | LegacyComparisonReport,
	runsDirectory: string,
): Promise<ComparisonAttemptHistoryLinks> {
	if (report.mode !== "session") {
		return {};
	}
	const links: Record<
		string,
		Record<ComparisonArm, readonly ComparisonAttemptHistoryLink[]>
	> = {};
	for (const benchmarkCase of report.cases) {
		const linksForArm = (
			arm: ComparisonArm,
		): Promise<readonly ComparisonAttemptHistoryLink[]> =>
			Promise.all(
				benchmarkCase.arms[arm].source.reps.map((rep) =>
					comparisonAttemptHistoryLink({
						runsDirectory,
						caseId: benchmarkCase.caseId,
						group: benchmarkCase.arms[arm].source.group,
						rep,
					}),
				),
			);
		links[benchmarkCase.caseId] = {
			baseline: await linksForArm("baseline"),
			candidate: await linksForArm("candidate"),
			control: await linksForArm("control"),
		};
	}

	return links;
}
