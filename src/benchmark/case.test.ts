import { describe, expect, it } from "bun:test";
import {
	CASES_DIRECTORY,
	CaseDeclarationError,
	casesRoot,
	caseRelative,
	listCases,
	loadCase,
	parseCaseDeclaration,
	readCaseDeclaration,
	requirePipelineCase,
	requireSessionCase,
	transcriptPrefixPath,
} from "#benchmark/case";
import type { CaseDeclaration } from "#benchmark/case";
import { CONTROL_DIR, DEFAULT_CASE_ID } from "#benchmark/config";
import type { Immutable } from "#benchmark/contracts";
import type { JsonObject } from "#benchmark/json-value";
import { chmod, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { runCommand } from "#benchmark/command";
import { pipelineDefinitionSchema } from "#benchmark/pipeline";
import { DEFAULT_STAGE_SETTINGS_FILE } from "#benchmark/stage-settings";
import { PROJECT_ROOT, TestResources } from "#benchmark/test-support";

/**
 * The commit before the case files moved out of the control root. Reading the
 * bytes from Git rather than from the working tree is what makes this a
 * characterization: the move cannot quietly rewrite both sides at once.
 */
const COMMIT_BEFORE_THE_MOVE = "ccfdeb017667a0a1db9027a5e014b7e5650b7935";

function bytesBeforeTheMove(path: string): Promise<string> {
	return runCommand(
		["git", "show", `${COMMIT_BEFORE_THE_MOVE}:${path}`],
		PROJECT_ROOT,
	);
}

describe(parseCaseDeclaration.name, () => {
	function declaration(id = "audit-log"): string {
		return JSON.stringify({
			id,
			kind: "pipeline",
			title: "Audit log",
			task: "backlog-seed.md",
			productBrief: "product-brief.md",
			finalRubric: "rubric.md",
			pipeline: "pipelines/default.json",
			rubrics: "rubrics",
			target: { path: "../../../nest/template" },
		});
	}

	it("refuses a declaration whose id is not its directory name, naming both", () => {
		expect(() =>
			parseCaseDeclaration("audit-log", declaration("other")),
		).toThrow(
			"Case declaration id other does not match its directory name audit-log",
		);
	});

	it("accepts a declaration whose id is its directory name", () => {
		expect(parseCaseDeclaration("audit-log", declaration()).id).toBe(
			"audit-log",
		);
	});

	it("carries the model and session budget a pipeline case declares", () => {
		const parsed = parseCaseDeclaration(
			"audit-log",
			JSON.stringify({
				id: "audit-log",
				kind: "pipeline",
				title: "Audit log",
				task: "backlog-seed.md",
				productBrief: "product-brief.md",
				finalRubric: "rubric.md",
				pipeline: "pipelines/default.json",
				rubrics: "rubrics",
				target: { path: "../../../nest/template" },
				model: "sonnet",
				sessionBudgetUsd: 10,
			}),
		);

		expect(parsed).toMatchObject({ model: "sonnet", sessionBudgetUsd: 10 });
	});

	it("carries the model and session budget a session case declares", () => {
		const parsed = parseCaseDeclaration(
			"smoke",
			JSON.stringify({
				id: "smoke",
				kind: "session",
				title: "Smoke",
				prompt: "Reply with the single word OK.",
				tools: [],
				corpusFiles: ["output-styles/brief.md"],
				checks: [{ kind: "tool-calls", max: 0 }],
				model: "sonnet",
				sessionBudgetUsd: 0.2,
			}),
		);

		expect(parsed).toMatchObject({ model: "sonnet", sessionBudgetUsd: 0.2 });
	});

	it.each(["sub/prefix.jsonl", "prefix.json", "prefix.jsonl.bak"])(
		"refuses a transcript file %s, which is not a bare .jsonl name",
		(file) => {
			expect(() =>
				parseCaseDeclaration(
					"smoke",
					JSON.stringify({
						id: "smoke",
						kind: "session",
						title: "Smoke",
						prompt: "Reply with the single word OK.",
						transcript: {
							file,
							sha256: "a".repeat(64),
							sourceSession: "aaaaaaaa-1111-2222-3333-444444444444",
							cut: 3,
						},
						tools: [],
						corpusFiles: ["output-styles/brief.md"],
						checks: [{ kind: "tool-calls", max: 0 }],
					}),
				),
			).toThrow(
				"Case smoke declaration has an invalid transcript.file: A transcript prefix is a .jsonl file name in the case directory",
			);
		},
	);
});

describe(caseRelative.name, () => {
	const declaration = {
		id: "audit-log",
		kind: "pipeline",
		title: "Audit log",
		task: "backlog-seed.md",
		productBrief: "product-brief.md",
		finalRubric: "rubric.md",
		pipeline: "pipelines/default.json",
		rubrics: "rubrics",
		target: { path: "/target" },
	} as const;

	it.each(["/etc/passwd", "../../CLAUDE.md", "rubrics/../../CLAUDE.md"])(
		"refuses %s, which leaves the case directory",
		(path) => {
			expect(() => caseRelative(declaration, path)).toThrow(
				`Case audit-log names a path outside its case directory: ${path}`,
			);
		},
	);

	it("resolves a path inside the case directory against it", () => {
		expect(caseRelative(declaration, "rubrics/shape.json")).toBe(
			join(CONTROL_DIR, "cases/audit-log/rubrics/shape.json"),
		);
	});
});

describe(listCases.name, () => {
	const resources = TestResources.forEachTest();

	it("lists the readable cases past a directory that holds no declaration", async () => {
		const stray = join(CONTROL_DIR, CASES_DIRECTORY, "zz-stray-probe");
		resources.track(stray);
		await mkdir(stray, { recursive: true });

		const listing = await listCases();

		expect(listing.declarations.map(({ id }) => id)).toContain("audit-log");
		expect(listing.unreadable).toEqual([
			{
				id: "zz-stray-probe",
				reason:
					"Unknown case zz-stray-probe: no declaration at cases/zz-stray-probe/case.json",
			},
		]);
	});
});

describe(readCaseDeclaration.name, () => {
	const resources = TestResources.forEachTest();

	it("translates an unreadable declaration into a case error", async () => {
		const caseId = "zz-unreadable-case";
		const directory = join(CONTROL_DIR, CASES_DIRECTORY, caseId);
		const path = join(directory, "case.json");
		resources.track(directory);
		await mkdir(directory, { recursive: true });
		await Bun.write(path, "{}");
		await chmod(path, 0);

		try {
			let failure: unknown;
			try {
				await readCaseDeclaration(caseId);
			} catch (error) {
				failure = error;
			}
			expect(failure).toBeInstanceOf(CaseDeclarationError);
		} finally {
			await chmod(path, 0o600);
		}
	});
});

describe("loadCase", () => {
	it("resolves the same case whether the id is default or named", async () => {
		const [byDefault, byName] = await Promise.all([
			loadCase(DEFAULT_CASE_ID),
			loadCase("audit-log"),
		]);

		expect(byDefault).toEqual(byName);
	});

	it("refuses a case with no declaration on disk, naming it", () => {
		expect(loadCase("missing")).rejects.toThrow("Unknown case missing");
	});

	it("resolves a relative declared target against the case directory", async () => {
		const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

		expect(benchmarkCase.targetPath).toBe(
			resolve(
				CONTROL_DIR,
				"cases/audit-log",
				benchmarkCase.declaration.target.path,
			),
		);
	});

	it("returns the audit-log task, brief, and final rubric byte for byte", async () => {
		const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

		expect(benchmarkCase.task).toBe(
			await bytesBeforeTheMove("backlog-seed.md"),
		);
		expect(benchmarkCase.productBrief).toBe(
			await bytesBeforeTheMove("product-brief.md"),
		);
		expect(benchmarkCase.finalRubric).toBe(
			await bytesBeforeTheMove("rubric.md"),
		);
	});

	it("returns the audit-log stage rubrics byte for byte", async () => {
		const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

		expect(benchmarkCase.stageRubrics["shape"]?.content).toBe(
			await bytesBeforeTheMove("rubrics/shape.json"),
		);
		expect(benchmarkCase.stageRubrics["build"]?.content).toBe(
			await bytesBeforeTheMove("rubrics/build.json"),
		);
	});

	it("returns the audit-log pipeline definition as it was before the move, with its rubrics rehomed", async () => {
		const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

		const before = await bytesBeforeTheMove("pipelines/default.json");
		const rehomed = pipelineDefinitionSchema.parse(
			JSON.parse(before.replaceAll('"rubrics/', '"cases/audit-log/rubrics/')),
		);
		const { setup: _setup, ...target } = benchmarkCase.pipeline.target;

		expect({ ...benchmarkCase.pipeline, target }).toEqual(rehomed);
	});

	it("resolves the harness-owned default settings file when the case declares none", async () => {
		const benchmarkCase = requirePipelineCase(await loadCase("audit-log"));

		expect(benchmarkCase.settingsFilePath).toBe(
			join(CONTROL_DIR, DEFAULT_STAGE_SETTINGS_FILE),
		);
	});

	it("carries a declared settingsFile on the pipeline declaration", () => {
		const id = "audit-log";
		const declared = parseCaseDeclaration(
			id,
			JSON.stringify({
				id,
				kind: "pipeline",
				title: "Audit log",
				task: "backlog-seed.md",
				productBrief: "product-brief.md",
				finalRubric: "rubric.md",
				pipeline: "pipelines/default.json",
				rubrics: "rubrics",
				target: { path: "../../../nest/template" },
				settingsFile: "settings.json",
			}),
		);

		expect(declared).toMatchObject({ settingsFile: "settings.json" });
	});

	it("names the missing file and the fix when a declared file is absent", async () => {
		const resources = TestResources.forEachTest();
		const id = "zz-missing-task-probe";
		const directory = join(casesRoot(), id);
		resources.track(directory);
		await mkdir(join(directory, "rubrics"), { recursive: true });
		await Bun.write(join(directory, "product-brief.md"), "Brief");
		await Bun.write(join(directory, "rubric.md"), "Rubric");
		await Bun.write(
			join(directory, "rubrics/build.json"),
			JSON.stringify({
				hardBlockers: [
					{ id: "invalid-stage-delivery", description: "d" },
					{ id: "false-test-safety", description: "d" },
					{ id: "unfinished-delivery", description: "d" },
				],
				requirements: [],
				dimensions: [],
			}),
		);
		await Bun.write(
			join(directory, "pipeline.json"),
			JSON.stringify({
				statuses: ["To Do", "Build", "Done"],
				target: {
					checks: [{ command: ["true"] }],
					integrityFiles: ["base.txt"],
				},
				stages: [
					{ name: "build", kind: "delivery", skill: "build", rubric: "b" },
				],
			}),
		);
		await Bun.write(
			join(directory, "case.json"),
			JSON.stringify({
				id,
				kind: "pipeline",
				title: "Missing task",
				task: "backlog-seed.md",
				productBrief: "product-brief.md",
				finalRubric: "rubric.md",
				pipeline: "pipeline.json",
				rubrics: "rubrics",
				target: { path: "/tmp/does-not-matter" },
			}),
		);

		const failure = loadCase(id);

		expect(failure).rejects.toBeInstanceOf(CaseDeclarationError);
		expect(failure).rejects.toThrow(
			`Case ${id} declares task at backlog-seed.md, but no file is there; add it or correct the declaration`,
		);
	});
});

describe("loadCase for a session case", () => {
	function sessionDeclaration(overrides: Immutable<JsonObject> = {}): string {
		return JSON.stringify({
			id: "smoke",
			kind: "session",
			title: "Smoke",
			prompt: "Reply with the single word OK.",
			tools: [],
			corpusFiles: [],
			checks: [{ kind: "word-band", max: 1 }],
			...overrides,
		});
	}

	it("returns the smoke case carrying its prompt, tools, and checks", async () => {
		const loaded = requireSessionCase(await loadCase("smoke"));

		expect(loaded).toMatchObject({
			prompt: "Reply with the single word OK.",
			tools: [],
			checks: [
				{ kind: "word-band", max: 1 },
				{ kind: "tool-calls", max: 0 },
			],
		});
	});

	it("carries the state check a session case declares", () => {
		const declaration = parseCaseDeclaration(
			"smoke",
			sessionDeclaration({
				stateCheck: {
					command: ["sh", "score.sh"],
					outcomes: ["tree-clean", "cards-archived"],
				},
			}),
		);
		if (declaration.kind !== "session") {
			throw new Error("expected a session declaration");
		}

		expect(declaration.stateCheck).toEqual({
			command: ["sh", "score.sh"],
			outcomes: ["tree-clean", "cards-archived"],
		});
	});

	it("refuses a state check declaring no outcome to report", () => {
		const failure = (): CaseDeclaration =>
			parseCaseDeclaration(
				"smoke",
				sessionDeclaration({
					stateCheck: { command: ["sh", "score.sh"], outcomes: [] },
				}),
			);

		expect(failure).toThrow(CaseDeclarationError);
	});

	it("refuses a state check declaring the same outcome twice", () => {
		const failure = (): CaseDeclaration =>
			parseCaseDeclaration(
				"smoke",
				sessionDeclaration({
					stateCheck: {
						command: ["sh", "score.sh"],
						outcomes: ["tree-clean", "tree-clean"],
					},
				}),
			);

		expect(failure).toThrow(CaseDeclarationError);
	});

	it("defaults projectFiles to an empty list when a session declaration omits it", () => {
		const declaration = parseCaseDeclaration("smoke", sessionDeclaration());
		if (declaration.kind !== "session") {
			throw new Error("expected a session declaration");
		}

		expect(declaration.projectFiles).toEqual([]);
	});

	it.each(["/etc", "../../CLAUDE.md"])(
		"refuses a fixture at %s, which leaves the case directory",
		(fixture) => {
			const declaration = parseCaseDeclaration(
				"smoke",
				sessionDeclaration({ fixture }),
			);

			expect(() => caseRelative(declaration, fixture)).toThrow(
				`Case smoke names a path outside its case directory: ${fixture}`,
			);
		},
	);

	it("refuses a session declaration carrying a pipeline field, naming the key", () => {
		expect(() =>
			parseCaseDeclaration(
				"smoke",
				sessionDeclaration({ pipeline: "pipelines/default.json" }),
			),
		).toThrow(
			'Case smoke declaration has an invalid declaration: Unrecognized key: "pipeline"',
		);
	});
});

describe("every committed case whose prefix bytes are on disk", () => {
	/**
	 * `forkTranscript` rewrites identity by replacing the declared source session
	 * where it occurs in the prefix, so a declaration naming an id the bytes do
	 * not carry resumes the session it was cut from and still reports success.
	 * One committed case shipped in that state, so the invariant is asserted over
	 * the bytes rather than left to the runtime guard.
	 */
	it("declares a source session its prefix's bytes carry", async () => {
		const listing = await listCases();
		const withheld: string[] = [];
		const declared: { id: string; sourceSession: string; found: boolean }[] =
			[];
		for (const declaration of listing.declarations) {
			if (
				declaration.kind !== "session" ||
				declaration.transcript === undefined
			) {
				continue;
			}

			const path = transcriptPrefixPath(
				declaration.id,
				declaration.transcript.file,
			);
			if (!(await Bun.file(path).exists())) {
				withheld.push(declaration.id);
				continue;
			}

			const bytes = await Bun.file(path).text();
			declared.push({
				id: declaration.id,
				sourceSession: declaration.transcript.sourceSession,
				found: bytes.includes(declaration.transcript.sourceSession),
			});
		}

		expect(declared.length + withheld.length).toBeGreaterThan(0);
		expect(declared.filter(({ found }) => !found)).toEqual([]);
	});
});

describe("loadCase for the brief-reply cases", () => {
	const TURNS = [
		{
			caseId: "brief-reply-e3dea673",
			sourceSession: "e3dea673-663a-4a3e-b89f-4ffb568e7109",
			cut: 873,
			acceptedWords: 145,
		},
		{
			caseId: "brief-reply-02f0f204",
			sourceSession: "02f0f204-613d-49d2-8999-67ba79fedbb1",
			cut: 1270,
			acceptedWords: 136,
		},
		{
			caseId: "brief-reply-40878d26",
			sourceSession: "40878d26-3572-4a08-a668-4e4c275e462e",
			cut: 491,
			acceptedWords: 108,
		},
		{
			caseId: "brief-reply-92b2e8b0",
			sourceSession: "92b2e8b0-1cac-4855-87be-ba84d5cee5b9",
			cut: 1268,
			acceptedWords: 76,
		},
	];

	it.each(TURNS)(
		"cuts $caseId at its own turn and states the accepted length in its title",
		async ({ caseId, sourceSession, cut, acceptedWords }) => {
			const loaded = requireSessionCase(await loadCase(caseId));

			expect(loaded.declaration.title).toContain(
				`${String(acceptedWords)} words`,
			);
			expect(loaded.declaration).toMatchObject({
				transcript: { sourceSession, cut },
			});
		},
	);

	it.each(TURNS)(
		"judges $caseId by a band with a ceiling and no floor, the em dash alone, and no tool calls",
		async ({ caseId }) => {
			const loaded = requireSessionCase(await loadCase(caseId));

			expect(loaded.checks).toEqual([
				{ kind: "word-band", max: 154 },
				{ kind: "forbidden-text", strings: ["\u2014"] },
				{ kind: "tool-calls", max: 0 },
			]);
		},
	);

	/**
	 * The four cases differ only in which turn they resume: what they run is
	 * one measurement of one corpus file under one style, so every case that
	 * lost the overlay, the corpus file, or the prompt would be measuring
	 * something else while still passing every per-turn assertion above.
	 */
	it.each(TURNS)(
		"runs $caseId against the brief style overlay with the same prompt, no tools, and the one corpus file it reads",
		async ({ caseId }) => {
			const loaded = requireSessionCase(await loadCase(caseId));

			expect(loaded).toMatchObject({
				prompt:
					"Tools are unavailable now. Write your reply to João for this turn.",
				tools: [],
				settings: { outputStyle: "brief" },
				corpusFiles: ["output-styles/brief.md"],
			});
		},
	);
});

/**
 * The schema decides which names a prefix can carry and `.gitignore` decides
 * which ones stay unpublished. Nothing in the language links the two, so the
 * agreement is asserted here against git itself.
 */
describe("the ignore rule for transcript prefixes", () => {
	function acceptedName(file: string): string | undefined {
		const declaration = parseCaseDeclaration(
			"smoke",
			JSON.stringify({
				id: "smoke",
				kind: "session",
				title: "Smoke",
				prompt: "Reply with the single word OK.",
				transcript: {
					file,
					sha256: "a".repeat(64),
					sourceSession: "aaaaaaaa-1111-2222-3333-444444444444",
					cut: 3,
				},
				tools: [],
				corpusFiles: [],
				checks: [{ kind: "tool-calls", max: 0 }],
			}),
		);

		return declaration.kind === "session"
			? declaration.transcript?.file
			: undefined;
	}

	async function ignored(path: string): Promise<boolean> {
		try {
			await runCommand(["git", "check-ignore", "-q", path], PROJECT_ROOT);

			return true;
		} catch {
			return false;
		}
	}

	it.each([
		"capture.jsonl",
		"a0491c04-fb39-42b6-851e-37aba8250e82-cut-24.jsonl",
	])("covers %s, a name the declaration schema accepts", async (file) => {
		expect(acceptedName(file)).toBe(file);
		expect(await ignored(join(CASES_DIRECTORY, "smoke", file))).toBe(true);
	});

	it("leaves a case's other declared input files tracked", async () => {
		expect(
			await ignored(
				join(CASES_DIRECTORY, "manifest-probe", "fixture", "x.jsonl"),
			),
		).toBe(false);
	});
});

describe(transcriptPrefixPath.name, () => {
	it("resolves a declared file under the case's own committed directory", () => {
		expect(transcriptPrefixPath("smoke", "prefix.jsonl")).toBe(
			join(casesRoot(), "smoke", "prefix.jsonl"),
		);
	});

	it.each([
		"../../../../../../etc/passwd",
		"/etc/passwd",
		"../audit-log/x.jsonl",
	])("refuses a transcript at %s, which leaves the case directory", (file) => {
		expect(() => transcriptPrefixPath("smoke", file)).toThrow(
			`Case smoke names a transcript outside its case directory: ${file}`,
		);
	});
});
