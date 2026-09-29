import { describe, expect, it } from "bun:test";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { diffTexts, loadAttempts, presentAttempts } from "./attempts";
import { stageOutputWords } from "./output-words";
import { benchmarkRunPaths } from "./run-layout";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

describe(loadAttempts.name, () => {
	const LINEAGE = "lineage-1";

	interface ScorecardFixture {
		readonly stage: string;
		readonly rubricPath: string;
		readonly costUsd: number;
		readonly prompt: string;
		readonly grade: {
			readonly hardBlockers: readonly never[];
			readonly requirements: readonly never[];
			readonly dimensions: readonly { id: string; grade: string }[];
			readonly summary: string;
			readonly grade: string;
			readonly verdict: string;
		};
		readonly input: {
			readonly stage: string;
			readonly artifact: { path: string; content: string };
		};
	}

	function originalScorecard(): ScorecardFixture {
		return {
			stage: "discuss",
			rubricPath: "rubrics/discuss.json",
			costUsd: 1.1,
			prompt: "p",
			grade: {
				hardBlockers: [],
				requirements: [],
				dimensions: [{ id: "clarity", grade: "B" }],
				summary: "fine",
				grade: "B",
				verdict: "CONTINUE",
			},
			input: {
				stage: "discuss",
				artifact: { path: "backlog/docs/D.md", content: "old spec\n" },
			},
		};
	}

	interface ReplayRecordFixture {
		readonly replay: true;
		readonly timestamp: string;
		readonly runName: string;
		readonly stage: string;
		readonly consumed: {
			readonly stage: string;
			readonly lineage: string;
			readonly targetSha: string;
		};
		readonly baseSha: string;
		readonly lineage: string;
		readonly corpusFiles: readonly { path: string; sha256: string }[];
		readonly model: string;
		readonly judgeModel: string;
		readonly sessionBudgetUsd: number;
		readonly controlSha: string;
		readonly stageCostUsd: number;
		readonly productOwnerCostUsd: number;
		readonly judgeCostUsd: number;
		readonly scorecard: ScorecardFixture;
	}

	function replayRecord(
		timestamp: string,
		content: string,
	): ReplayRecordFixture {
		return {
			replay: true,
			timestamp,
			runName: "run1",
			stage: "discuss",
			consumed: {
				stage: "initial",
				lineage: LINEAGE,
				targetSha: "task-sha",
			},
			baseSha: "base-sha",
			lineage: "replay-lineage",
			corpusFiles: [{ path: "CLAUDE.md", sha256: "aa".repeat(32) }],
			model: "sonnet",
			judgeModel: "sonnet",
			sessionBudgetUsd: 5,
			controlSha: "control-sha",
			stageCostUsd: 0.7,
			productOwnerCostUsd: 0.2,
			judgeCostUsd: 0.3,
			scorecard: {
				...originalScorecard(),
				costUsd: 0.3,
				grade: { ...originalScorecard().grade, grade: "A" },
				input: {
					stage: "discuss",
					artifact: { path: "backlog/docs/D.md", content },
				},
			},
		};
	}

	async function attemptFixture(): Promise<
		ReturnType<typeof benchmarkRunPaths>
	> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-attempts-"));
		testResources.track(directory);
		const paths = benchmarkRunPaths(directory, "run1");
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify(originalScorecard(), null, 2)}\n`,
		);
		await Bun.write(
			paths.replayRecordFile(LINEAGE, "2026-08-30T10:00:00.000Z"),
			`${JSON.stringify(replayRecord("2026-08-30T10:00:00.000Z", "new spec\n"), null, 2)}\n`,
		);

		return paths;
	}

	it("presents the original result and each replay as one attempt list", async () => {
		const paths = await attemptFixture();

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		expect(attempts.map(({ label }) => label)).toEqual([
			"original run run1",
			"replay 2026-08-30T10:00:00.000Z",
		]);
		expect(attempts[0]?.grade).toBe("B");
		expect(attempts[1]?.grade).toBe("A");
		expect(attempts[0]?.judgeCostUsd).toBeCloseTo(1.1);
		expect(attempts[0]?.totalCostUsd).toBeUndefined();
		expect(attempts[1]?.judgeCostUsd).toBeCloseTo(0.3);
		expect(attempts[1]?.totalCostUsd).toBeCloseTo(1.2);
	});

	it("counts the words of each attempt's artifact, the original's and each replay's", async () => {
		const paths = await attemptFixture();
		await Bun.write(
			paths.replayRecordFile(LINEAGE, "2026-08-30T11:00:00.000Z"),
			`${JSON.stringify(replayRecord("2026-08-30T11:00:00.000Z", "a longer new spec\n"), null, 2)}\n`,
		);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		expect(attempts.map(({ words }) => words)).toEqual([
			{ state: "available", words: 2 },
			{ state: "available", words: 2 },
			{ state: "available", words: 4 },
		]);
	});

	it("skips an original stage file that never reached a grade", async () => {
		const paths = await attemptFixture();
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify({ status: "AWAITING_STAGE_JUDGE", stage: "discuss" })}\n`,
		);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		expect(attempts.map(({ label }) => label)).toEqual([
			"replay 2026-08-30T10:00:00.000Z",
		]);
	});

	it("returns only the original when the checkpoint has no replays yet", async () => {
		const paths = await attemptFixture();

		const attempts = await loadAttempts(paths, "discuss", "other");

		expect(attempts).toHaveLength(1);
	});

	it("carries each replay's own corpus, model, and effort for the comparison guard", async () => {
		const paths = await attemptFixture();

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		expect(attempts[1]?.lineageInputs).toEqual({
			corpusFiles: [{ path: "CLAUDE.md", sha256: "aa".repeat(32) }],
			model: "sonnet",
			effort: undefined,
		});
	});

	it("carries a current original stage file's corpus, model, and effort for the comparison guard", async () => {
		const paths = await attemptFixture();
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify({
				...originalScorecard(),
				corpusFiles: [{ path: "CLAUDE.md", sha256: "bb".repeat(32) }],
				model: "opus",
				effort: "high",
			})}\n`,
		);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);

		expect(attempts[0]?.lineageInputs).toEqual({
			corpusFiles: [{ path: "CLAUDE.md", sha256: "bb".repeat(32) }],
			model: "opus",
			effort: "high",
		});
	});

	it("loads and presents a legacy original stage file beside a replay without guarding it", async () => {
		const paths = await attemptFixture();

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);
		const output = await presentAttempts(LINEAGE, attempts, () =>
			Promise.resolve("diff"),
		);

		expect(attempts[0]?.lineageInputs).toBeUndefined();
		expect(output).toContain("original run run1");
		expect(output).toContain("replay 2026-08-30T10:00:00.000Z");
	});

	it("presents a loaded original and replay whose corpora differ, naming the changed file", async () => {
		const paths = await attemptFixture();
		const originalCorpus = [
			{ path: "CLAUDE.md", sha256: "aa".repeat(32) },
			{ path: "skills/discuss/SKILL.md", sha256: "bb".repeat(32) },
		];
		await Bun.write(
			paths.stageFile("discuss"),
			`${JSON.stringify({
				...originalScorecard(),
				corpusFiles: originalCorpus,
				model: "sonnet",
			})}\n`,
		);
		await Bun.write(
			paths.replayRecordFile(LINEAGE, "2026-08-30T10:00:00.000Z"),
			`${JSON.stringify({
				...replayRecord("2026-08-30T10:00:00.000Z", "new spec\n"),
				corpusFiles: [
					originalCorpus[0],
					{ path: "skills/discuss/SKILL.md", sha256: "cc".repeat(32) },
				],
			})}\n`,
		);

		const attempts = await loadAttempts(paths, "discuss", LINEAGE);
		const output = await presentAttempts(LINEAGE, attempts, () =>
			Promise.resolve("diff"),
		);

		expect(output).toContain("skills/discuss/SKILL.md differs");
	});
});

describe(presentAttempts.name, () => {
	const attempt = (
		label: string,
		grade: string,
		content: string,
	): Parameters<typeof presentAttempts>[1][number] => ({
		label,
		grade,
		verdict: "CONTINUE",
		dimensions: [{ id: "clarity", grade }],
		judgeCostUsd: 1.25,
		artifact: { path: "backlog/docs/D.md", content },
		words: stageOutputWords({ artifact: { content } }),
	});

	it("shows grades side by side and diffs the latest attempt against earlier ones", async () => {
		const output = await presentAttempts(
			"lineage-1",
			[
				attempt("original run run1", "B", "old\n"),
				{ ...attempt("replay r2", "A", "new\n"), totalCostUsd: 2.15 },
			],
			(before, after) =>
				Promise.resolve(`DIFF(${before.trim()}->${after.trim()})`),
		);

		expect(output).toContain("Attempts at checkpoint lineage-1:");
		expect(output).toContain(
			"1. original run run1 — grade B (CONTINUE), judge $1.25 [clarity B]",
		);
		expect(output).toContain(
			"2. replay r2 — grade A (CONTINUE), judge $1.25, total $2.15 [clarity A]",
		);
		expect(output).toContain("Diff, original run run1 → replay r2:");
		expect(output).toContain("DIFF(old->new)");
	});

	it("marks identical artifacts instead of printing an empty diff", async () => {
		const output = await presentAttempts(
			"lineage-1",
			[
				attempt("original run run1", "B", "same\n"),
				attempt("replay r2", "B", "same\n"),
			],
			diffTexts,
		);

		expect(output).toContain("(identical)");
	});

	const lineageInputs = {
		corpusFiles: [
			{ path: "CLAUDE.md", sha256: "aa11" },
			{ path: "skills/discuss/SKILL.md", sha256: "bb22" },
		],
		model: "sonnet",
		effort: "high",
	} as const;

	it("presents attempts that share a consumed lineage", async () => {
		const output = await presentAttempts(
			"lineage-1",
			[
				{ ...attempt("original run run1", "B", "old\n"), lineageInputs },
				{ ...attempt("replay r2", "A", "new\n"), lineageInputs },
			],
			diffTexts,
		);

		expect(output).toContain("Attempts at checkpoint lineage-1:");
	});

	it("presents attempts whose corpus differs, naming the file", async () => {
		const output = await presentAttempts(
			"lineage-1",
			[
				{ ...attempt("original run run1", "B", "old\n"), lineageInputs },
				{
					...attempt("replay r2", "A", "new\n"),
					lineageInputs: {
						...lineageInputs,
						corpusFiles: [
							{ path: "CLAUDE.md", sha256: "aa11" },
							{ path: "skills/discuss/SKILL.md", sha256: "changed" },
						],
					},
				},
			],
			diffTexts,
		);

		expect(output).toContain("Attempts at checkpoint lineage-1:");
		expect(output).toContain("replay r2: skills/discuss/SKILL.md differs");
	});

	it("names which attempt a corpus file added or removed against the reference belongs to", async () => {
		const output = await presentAttempts(
			"lineage-1",
			[
				{ ...attempt("original run run1", "B", "old\n"), lineageInputs },
				{
					...attempt("replay r2", "A", "new\n"),
					lineageInputs: {
						...lineageInputs,
						corpusFiles: [
							{ path: "CLAUDE.md", sha256: "aa11" },
							{ path: "skills/discuss/SKILL.md", sha256: "bb22" },
							{ path: "skills/discuss/reference.md", sha256: "ee55" },
						],
					},
				},
			],
			diffTexts,
		);

		expect(output).toContain(
			"replay r2: skills/discuss/reference.md present in one attempt only",
		);
	});

	it("attributes each attempt's corpus difference separately when two replays edit the same file", async () => {
		const output = await presentAttempts(
			"lineage-1",
			[
				{ ...attempt("original run run1", "B", "old\n"), lineageInputs },
				{
					...attempt("replay r2", "A", "mid\n"),
					lineageInputs: {
						...lineageInputs,
						corpusFiles: [
							{ path: "CLAUDE.md", sha256: "aa11" },
							{ path: "skills/discuss/SKILL.md", sha256: "cc33" },
						],
					},
				},
				{
					...attempt("replay r3", "A", "new\n"),
					lineageInputs: {
						...lineageInputs,
						corpusFiles: [
							{ path: "CLAUDE.md", sha256: "aa11" },
							{ path: "skills/discuss/SKILL.md", sha256: "dd44" },
						],
					},
				},
			],
			diffTexts,
		);

		expect(output).toContain("replay r2: skills/discuss/SKILL.md differs");
		expect(output).toContain("replay r3: skills/discuss/SKILL.md differs");
	});

	it("refuses attempts whose model differs even when their corpus also differs", () => {
		expect(
			presentAttempts(
				"lineage-1",
				[
					{ ...attempt("original run run1", "B", "old\n"), lineageInputs },
					{
						...attempt("replay r2", "A", "new\n"),
						lineageInputs: {
							...lineageInputs,
							model: "opus",
							corpusFiles: [
								{ path: "CLAUDE.md", sha256: "aa11" },
								{ path: "skills/discuss/SKILL.md", sha256: "changed" },
							],
						},
					},
				],
				diffTexts,
			),
		).rejects.toThrow(/model sonnet.*opus/u);
	});

	it("refuses attempts whose model differs, naming the models", () => {
		expect(
			presentAttempts(
				"lineage-1",
				[
					{ ...attempt("original run run1", "B", "old\n"), lineageInputs },
					{
						...attempt("replay r2", "A", "new\n"),
						lineageInputs: { ...lineageInputs, model: "opus" },
					},
				],
				diffTexts,
			),
		).rejects.toThrow(/model sonnet.*opus/u);
	});

	it("refuses attempts whose effort differs, naming the efforts", () => {
		expect(
			presentAttempts(
				"lineage-1",
				[
					{ ...attempt("original run run1", "B", "old\n"), lineageInputs },
					{
						...attempt("replay r2", "A", "new\n"),
						lineageInputs: { ...lineageInputs, effort: "low" },
					},
				],
				diffTexts,
			),
		).rejects.toThrow(/effort high.*low/u);
	});

	it("names the attempts whose lineages disagree", () => {
		expect(
			presentAttempts(
				"lineage-1",
				[
					{ ...attempt("original run run1", "B", "old\n"), lineageInputs },
					{
						...attempt("replay r2", "A", "new\n"),
						lineageInputs: { ...lineageInputs, model: "opus" },
					},
				],
				diffTexts,
			),
		).rejects.toThrow(/original run run1.*replay r2/u);
	});

	it("refuses a later attempt that disagrees with ones before it", () => {
		expect(
			presentAttempts(
				"lineage-1",
				[
					{ ...attempt("replay r1", "B", "one\n"), lineageInputs },
					{ ...attempt("replay r2", "B", "two\n"), lineageInputs },
					{
						...attempt("replay r3", "A", "three\n"),
						lineageInputs: { ...lineageInputs, model: "opus" },
					},
				],
				diffTexts,
			),
		).rejects.toThrow(/replay r3/u);
	});

	it("presents attempts that record no lineage inputs, as records before this did", async () => {
		const output = await presentAttempts(
			"lineage-1",
			[
				attempt("original run run1", "B", "old\n"),
				attempt("replay r2", "A", "new\n"),
			],
			diffTexts,
		);

		expect(output).toContain("Attempts at checkpoint lineage-1:");
	});
});

describe(diffTexts.name, () => {
	it("returns a unified diff when the contents differ and nothing when equal", async () => {
		expect(await diffTexts("a\n", "a\n")).toBe("");
		const diff = await diffTexts("a\n", "b\n");
		expect(diff).toContain("-a");
		expect(diff).toContain("+b");
	});
});
