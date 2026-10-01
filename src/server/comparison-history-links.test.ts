import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import {
	sessionConfirmationGroupRecordSchema,
	sessionConfirmationRepRecordSchema,
} from "#benchmark/confirmation-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	directorySource,
	nothingRunning,
	fixedCorpusSource,
	NO_PROVIDER_PROJECTS,
} from "#benchmark/run-records-test-support";
import { sessionAttemptRecordSchema } from "#benchmark/session-record";
import { createApiApp } from "./api";
import { comparisonAttemptHistoryLink } from "./comparison-history-links";

const roots: string[] = [];

afterEach(async () => {
	await Promise.all(
		roots.splice(0).map((root) => rm(root, { force: true, recursive: true })),
	);
});

function digest(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

interface RecordedSessionAttempt {
	readonly root: string;
	readonly runsDirectory: string;
	readonly paths: ReturnType<typeof confirmationGroupPaths>;
	readonly repPaths: ReturnType<
		ReturnType<typeof confirmationGroupPaths>["rep"]
	>;
	readonly groupText: string;
	readonly repText: string;
	readonly attemptText: string;
	readonly recorded: (path: string) => string;
	readonly request: Parameters<typeof comparisonAttemptHistoryLink>[0];
}

async function recordSessionAttempt(): Promise<RecordedSessionAttempt> {
	const root = await mkdtemp(join(tmpdir(), "rehearse-comparison-history-"));
	roots.push(root);
	const runsDirectory = join(root, ".benchmark-runs");
	const paths = confirmationGroupPaths(runsDirectory, "group-a");
	const repPaths = paths.rep("group-a-rep-1");
	await mkdir(repPaths.directory, { recursive: true });
	const groupText = `${JSON.stringify(
		sessionConfirmationGroupRecordSchema.parse({
			schemaVersion: 2,
			caseId: "case-a",
			groupId: "group-a",
			mode: "session",
			reps: 2,
			declaredStages: ["checks"],
			inputs: {
				lineage: { kind: "SESSION", lineage: "lineage-a" },
				files: [
					{ kind: "case", path: "inputs/case.json", sha256: "a".repeat(64) },
				],
				model: "sonnet",
				sessionBudgetUsd: 1,
			},
			projectedCost: {
				reps: 2,
				perRepMaximumUsd: 1,
				preflightMaximumUsd: 0,
				totalMaximumUsd: 2,
			},
			preflight: { status: "MISSING", missing: "metrics unavailable" },
			approval: { method: "yes", approved: true },
			repRecords: [1, 2].map((ordinal) => ({
				repId: `group-a-rep-${ordinal}`,
				ordinal,
				path: `reps/group-a-rep-${ordinal}/rep.json`,
			})),
			reportFile: "report.json",
			makespanMs: 1,
		}),
	)}\n`;
	const repText = `${JSON.stringify(
		sessionConfirmationRepRecordSchema.parse({
			schemaVersion: 2,
			caseId: "case-a",
			groupId: "group-a",
			repId: "group-a-rep-1",
			ordinal: 1,
			mode: "session",
			lineage: { kind: "SESSION", lineage: "lineage-a" },
			outcome: "UNSUCCESSFUL",
			stages: [
				{
					stage: "checks",
					status: "NOT_REACHED",
					reason: "not reached",
					evidence: { recordFile: "attempt.json" },
				},
			],
			finalOutcome: { status: "NOT_APPLICABLE" },
			metrics: { status: "MISSING", calls: [], missing: ["metrics"] },
			workerTrajectorySteps: 0,
			elapsedMs: 1,
		}),
	)}\n`;
	const attemptText = `${JSON.stringify(
		sessionAttemptRecordSchema.parse({
			schemaVersion: 1,
			caseId: "case-a",
			lineage: "lineage-a",
			model: "sonnet",
			sessionBudgetUsd: 1,
			corpusFiles: [],
			prompt: "inspect",
			reply: "done",
			transcriptFile: "ignored",
			outcome: "SUCCESSFUL",
			checks: [{ kind: "word-band", status: "PASS", detail: "pass" }],
			elapsedMs: 1,
		}),
	)}\n`;
	await Bun.write(paths.groupFile, groupText);
	await Bun.write(repPaths.recordFile, repText);
	await Bun.write(repPaths.attemptFile, attemptText);
	await Bun.write(
		repPaths.transcriptFile,
		`${JSON.stringify({ type: "assistant", message: { content: "saved" } })}\n`,
	);
	const manifestDirectory = join(root, "manifests", "nested");
	const recorded = (path: string): string => relative(manifestDirectory, path);
	const request = {
		runsDirectory,
		caseId: "case-a",
		group: { path: recorded(paths.groupFile), sha256: digest(groupText) },
		rep: {
			repId: "group-a-rep-1",
			ordinal: 1,
			path: recorded(repPaths.recordFile),
			sha256: digest(repText),
			attempt: {
				path: recorded(repPaths.attemptFile),
				sha256: digest(attemptText),
			},
		},
	};

	return {
		root,
		runsDirectory,
		paths,
		repPaths,
		groupText,
		repText,
		attemptText,
		recorded,
		request,
	};
}

describe(comparisonAttemptHistoryLink.name, () => {
	it("links only when the group, rep, and attempt paths and digests agree", async () => {
		const {
			root,
			runsDirectory,
			paths,
			repPaths,
			groupText,
			repText,
			attemptText,
			recorded,
			request,
		} = await recordSessionAttempt();

		expect(await comparisonAttemptHistoryLink(request)).toEqual({
			status: "available",
			repId: "group-a-rep-1",
			ordinal: 1,
			href: "/groups/group-a/reps/group-a-rep-1/attempt",
		});
		const response = await createApiApp({
			projectsDirectory: NO_PROVIDER_PROJECTS,
			runsDirectory,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(directorySource(root)),
		}).request("/api/groups/group-a/reps/group-a-rep-1/attempt/history");
		expect(response.status).toBe(200);
		const stale = {
			status: "stale",
			repId: "group-a-rep-1",
			ordinal: 1,
		} as const;
		expect(
			await comparisonAttemptHistoryLink({
				...request,
				group: { ...request.group, sha256: "0".repeat(64) },
			}),
		).toEqual(stale);
		expect(
			await comparisonAttemptHistoryLink({
				...request,
				rep: { ...request.rep, sha256: "0".repeat(64) },
			}),
		).toEqual(stale);
		expect(
			await comparisonAttemptHistoryLink({
				...request,
				rep: {
					...request.rep,
					attempt: { ...request.rep.attempt, sha256: "0".repeat(64) },
				},
			}),
		).toEqual(stale);

		const wrongGroupFile = confirmationGroupPaths(
			runsDirectory,
			"group-b",
		).groupFile;
		await Bun.write(wrongGroupFile, groupText);
		expect(
			await comparisonAttemptHistoryLink({
				...request,
				group: { ...request.group, path: recorded(wrongGroupFile) },
			}),
		).toEqual(stale);

		const groupRecord = sessionConfirmationGroupRecordSchema.parse(
			JSON.parse(groupText),
		);
		const unownedGroupText = `${JSON.stringify({
			...groupRecord,
			repRecords: Array.from(groupRecord.repRecords, (reference) =>
				reference.repId === "group-a-rep-1"
					? { ...reference, path: "reps/other/rep.json" }
					: reference,
			),
		})}\n`;
		await Bun.write(paths.groupFile, unownedGroupText);
		expect(
			await comparisonAttemptHistoryLink({
				...request,
				group: { ...request.group, sha256: digest(unownedGroupText) },
			}),
		).toEqual(stale);
		await Bun.write(paths.groupFile, groupText);

		await Bun.write(paths.groupFile, `${groupText}\n`);
		expect(await comparisonAttemptHistoryLink(request)).toEqual(stale);
		await Bun.write(paths.groupFile, groupText);
		await Bun.write(repPaths.recordFile, `${repText}\n`);
		expect(await comparisonAttemptHistoryLink(request)).toEqual(stale);
		await Bun.write(repPaths.recordFile, repText);
		await Bun.write(repPaths.attemptFile, `${attemptText}\n`);
		expect(await comparisonAttemptHistoryLink(request)).toEqual(stale);
	});

	it("links an attempt numbered within its arm, after an earlier group's attempts", async () => {
		const { request } = await recordSessionAttempt();

		const link = await comparisonAttemptHistoryLink({
			...request,
			rep: { ...request.rep, ordinal: 3 },
		});

		expect(link).toEqual({
			status: "available",
			repId: "group-a-rep-1",
			ordinal: 3,
			href: "/groups/group-a/reps/group-a-rep-1/attempt",
		});
	});
});
