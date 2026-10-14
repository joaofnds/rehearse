import { describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import type { CaseDeclaration } from "#benchmark/case";
import {
	caseDeclarationSchema,
	CASES_DIRECTORY,
	casesRoot,
} from "#benchmark/case";
import { CONTROL_DIR, DEFAULT_CASE_ID } from "#benchmark/config";
import { projectFormatted } from "#benchmark/project-format";
import { sessionAttemptPaths } from "#benchmark/run-layout";
import { TestResources } from "#benchmark/test-support";
import type { OutputRecorder } from "#cli/cli-test-support";
import { failureOf, recordOutput } from "#cli/cli-test-support";
import type { CaseCaptureRequest } from "#cli/case-command";
import {
	requireCase,
	runCaseCapture,
	runCaseList,
	runCaseShow,
} from "#cli/case-command";
import { UsageError } from "#cli/commands";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

function printedDeclarations(text: string): readonly CaseDeclaration[] {
	return z.array(caseDeclarationSchema).parse(z.json().parse(JSON.parse(text)));
}

function printedDeclaration(text: string): CaseDeclaration {
	return caseDeclarationSchema.parse(z.json().parse(JSON.parse(text)));
}

describe(requireCase.name, () => {
	const resources = TestResources.forEachTest();

	it("refuses a case whose declared pipeline is not there, naming it", async () => {
		const id = "zz-missing-pipeline-probe";
		const directory = join(casesRoot(), id);
		resources.track(directory);
		await mkdir(directory, { recursive: true });
		await Bun.write(join(directory, "backlog-seed.md"), "Task");
		await Bun.write(join(directory, "product-brief.md"), "Brief");
		await Bun.write(join(directory, "rubric.md"), "Rubric");
		await Bun.write(
			join(directory, "case.json"),
			JSON.stringify({
				id,
				kind: "pipeline",
				title: "Missing pipeline",
				task: "backlog-seed.md",
				productBrief: "product-brief.md",
				finalRubric: "rubric.md",
				pipeline: "pipelines/missing.json",
				rubrics: "rubrics",
				target: { path: "/tmp/does-not-matter" },
			}),
		);

		const failure = await failureOf(requireCase(id));

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("pipelines/missing.json");
	});
});

describe(runCaseList.name, () => {
	it("prints one line per declared case with its id and title", async () => {
		const recorder = recordOutput();

		await runCaseList({ json: false }, recorder.output);

		expect(recorder.stderr).toEqual([]);
		const lines = recorder.stdout.join("").trimEnd().split("\n");
		expect(lines).toContain(
			`${DEFAULT_CASE_ID}\tAsynchronous audit log module against the NestJS template`,
		);
	});

	it("prints every declaration as one JSON array with --json", async () => {
		const recorder = recordOutput();

		await runCaseList({ json: true }, recorder.output);

		const declarations = printedDeclarations(recorder.stdout.join(""));

		expect(declarations.map(({ id }) => id)).toContain(DEFAULT_CASE_ID);
	});

	it("names the case directory as a refused precondition when it is absent", async () => {
		const casesDirectory = join(CONTROL_DIR, CASES_DIRECTORY);
		const aside = `${casesDirectory}-absent-probe`;
		await rename(casesDirectory, aside);

		try {
			const failure = await failureOf(
				runCaseList({ json: false }, recordOutput().output),
			);

			expect(failure).toBeInstanceOf(RefusedPreconditionError);
			expect(failure.message).toContain(CASES_DIRECTORY);
		} finally {
			await rename(aside, casesDirectory);
		}
	});

	it("reports an unreadable case directory on stderr and still lists the rest", async () => {
		const stray = join(CONTROL_DIR, CASES_DIRECTORY, "zz-stray-probe");
		await mkdir(stray, { recursive: true });

		try {
			const recorder = recordOutput();

			await runCaseList({ json: false }, recorder.output);

			expect(recorder.stdout.join("")).toContain(DEFAULT_CASE_ID);
			expect(recorder.stderr.join("")).toContain("zz-stray-probe");
		} finally {
			await rm(stray, { force: true, recursive: true });
		}
	});
});

describe(runCaseShow.name, () => {
	it("prints exactly the parsed declaration with --json", async () => {
		const recorder = recordOutput();

		await runCaseShow({ caseId: DEFAULT_CASE_ID, json: true }, recorder.output);

		expect(recorder.stderr).toEqual([]);
		const printed = printedDeclaration(recorder.stdout.join(""));

		expect(printed.id).toBe(DEFAULT_CASE_ID);
	});

	it("prints the declaration file's path without --json", async () => {
		const recorder = recordOutput();

		await runCaseShow(
			{ caseId: DEFAULT_CASE_ID, json: false },
			recorder.output,
		);

		expect(recorder.stdout.join("")).toBe(
			`${join(CONTROL_DIR, CASES_DIRECTORY, DEFAULT_CASE_ID, "case.json")}\n`,
		);
	});

	it("refuses an unknown case as a refused precondition, naming it", async () => {
		const recorder = recordOutput();

		const failure = await failureOf(
			runCaseShow({ caseId: "missing", json: true }, recorder.output),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("missing");
		expect(recorder.stdout).toEqual([]);
	});

	it("refuses a missing case id as a usage error", async () => {
		const recorder = recordOutput();

		const failure = await failureOf(
			runCaseShow({ caseId: undefined, json: true }, recorder.output),
		);

		expect(failure.message).toContain("rehearse case show <case-id>");
	});
});

describe(runCaseCapture.name, () => {
	const CAPTURE_CASE_ID = "capture-probe";
	const SESSION_ID = "aaaaaaaa-1111-2222-3333-444444444444";
	const resources = TestResources.forEachTest();

	/**
	 * The probe case lives in a temporary cases root, never in the control
	 * repository's own: a failure between creating it and cleaning it up would
	 * otherwise leave a case behind that every later `case list` reports, in
	 * this suite and at the command line.
	 */
	async function probeCase(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-cases-"));
		resources.track(root);
		const directory = join(root, CAPTURE_CASE_ID);
		await mkdir(directory, { recursive: true });
		await Bun.write(
			join(directory, "case.json"),
			`${JSON.stringify(
				{
					id: CAPTURE_CASE_ID,
					kind: "session",
					title: "Capture probe",
					prompt: "Say the codeword.",
					tools: [],
					settings: { outputStyle: "brief" },
					corpusFiles: ["output-styles/brief.md"],
					checks: [
						{ kind: "word-band", max: 1 },
						{ kind: "forbidden-text", strings: ["\u2014"] },
					],
				},
				null,
				2,
			)}\n`,
		);

		return root;
	}

	async function probeProjects(
		...sessionIds: readonly string[]
	): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-capture-cli-"));
		resources.track(directory);
		const slug = join(directory, "-private-tmp-probe");
		await mkdir(slug, { recursive: true });
		for (const sessionId of sessionIds) {
			await Bun.write(
				join(slug, `${sessionId}.jsonl`),
				`${[0, 1, 2, 3]
					.map((ordinal) => JSON.stringify({ ordinal, sessionId }))
					.join("\n")}\n`,
			);
		}

		return directory;
	}

	async function capture(
		request: Omit<CaseCaptureRequest, "caseId">,
		projectsDirectory: string,
		casesDirectory: string,
		runsDirectory?: string,
	): Promise<OutputRecorder> {
		const recorder = recordOutput();
		await runCaseCapture(
			{ caseId: CAPTURE_CASE_ID, ...request },
			{
				projectsDirectory,
				runsDirectory: runsDirectory ?? join(projectsDirectory, "no-runs"),
				casesDirectory,
				output: recorder.output,
			},
		);

		return recorder;
	}

	it("writes the source's first cut lines into the case directory and records the digest", async () => {
		const cases = await probeCase();
		const projects = await probeProjects(SESSION_ID);

		const recorder = await capture(
			{ session: SESSION_ID, cut: "3", json: true },
			projects,
			cases,
		);

		const printed = printedDeclaration(recorder.stdout.join(""));
		expect(printed).toMatchObject({
			transcript: { sourceSession: SESSION_ID, cut: 3 },
		});
		const written = await Bun.file(
			join(
				cases,
				CAPTURE_CASE_ID,
				z.object({ transcript: z.object({ file: z.string() }) }).parse(printed)
					.transcript.file,
			),
		).text();
		expect(written.trimEnd().split("\n")).toHaveLength(3);
	});

	/**
	 * A saved attempt is the transcript the harness preserved under its own run
	 * layout, named `transcript.jsonl` like every other one, so it is the source
	 * that tells a content-derived identity from a name-derived one.
	 */
	async function probeRuns(sessionId: string): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-runs-cli-"));
		resources.track(directory);
		const attempt = sessionAttemptPaths(directory, {
			caseId: CAPTURE_CASE_ID,
			uuid: "8dc2b4b6-0000-0000-0000-000000000000",
		});
		await mkdir(attempt.directory, { recursive: true });
		await Bun.write(
			attempt.transcriptFile,
			`${[0, 1, 2, 3]
				.map((ordinal) => JSON.stringify({ ordinal, sessionId }))
				.join("\n")}\n`,
		);

		return directory;
	}

	async function emptyProjects(): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-projects-cli-"));
		resources.track(directory);

		return directory;
	}

	it("captures from a session the harness itself saved, whose transcript is not named after it", async () => {
		const cases = await probeCase();
		const runs = await probeRuns(SESSION_ID);

		const recorder = await capture(
			{ session: SESSION_ID, cut: "2", json: true },
			await emptyProjects(),
			cases,
			runs,
		);

		expect(printedDeclaration(recorder.stdout.join(""))).toMatchObject({
			transcript: { sourceSession: SESSION_ID },
		});
	});

	it("captures from the harness store on a machine with no interactive sessions directory", async () => {
		const cases = await probeCase();
		const runs = await probeRuns(SESSION_ID);

		const recorder = await capture(
			{ session: SESSION_ID, cut: "2", json: true },
			join(runs, "no-interactive-sessions"),
			cases,
			runs,
		);

		expect(printedDeclaration(recorder.stdout.join(""))).toMatchObject({
			transcript: { sourceSession: SESSION_ID },
		});
	});

	it("names the prefix it writes after the session id inside the transcript, not the source file", async () => {
		const cases = await probeCase();
		const runs = await probeRuns(SESSION_ID);

		const recorder = await capture(
			{ session: SESSION_ID, cut: "2", json: true },
			await emptyProjects(),
			cases,
			runs,
		);

		expect(printedDeclaration(recorder.stdout.join(""))).toMatchObject({
			transcript: { file: `${SESSION_ID}-cut-2.jsonl` },
		});
	});

	it("writes the committed declaration with a tab indent rather than the two spaces a record takes", async () => {
		const cases = await probeCase();
		const projects = await probeProjects(SESSION_ID);

		await capture(
			{ session: SESSION_ID, cut: "2", json: false },
			projects,
			cases,
		);

		const written = await Bun.file(
			join(cases, CAPTURE_CASE_ID, "case.json"),
		).text();
		expect(written).toContain('\n\t"id": "capture-probe"');
	});

	it("writes the committed declaration as the project's formatter leaves it", async () => {
		const cases = await probeCase();
		const projects = await probeProjects(SESSION_ID);

		await capture(
			{ session: SESSION_ID, cut: "2", json: false },
			projects,
			cases,
		);

		const written = await Bun.file(
			join(cases, CAPTURE_CASE_ID, "case.json"),
		).text();
		expect(written).toBe(await projectFormatted("case.json", written));
	});

	it("leaves the operator nothing to run before committing", async () => {
		const cases = await probeCase();
		const projects = await probeProjects(SESSION_ID);

		const recorder = await capture(
			{ session: SESSION_ID, cut: "2", json: false },
			projects,
			cases,
		);

		expect(recorder.stderr).toEqual([]);
	});

	it("records the transcript in the committed declaration on disk", async () => {
		const cases = await probeCase();
		const projects = await probeProjects(SESSION_ID);

		await capture(
			{ session: SESSION_ID, cut: "2", json: false },
			projects,
			cases,
		);

		const declaration = printedDeclaration(
			await Bun.file(join(cases, CAPTURE_CASE_ID, "case.json")).text(),
		);
		expect(declaration).toMatchObject({ transcript: { cut: 2 } });
	});

	it("resolves a unique session prefix", async () => {
		const cases = await probeCase();
		const projects = await probeProjects(SESSION_ID);

		const recorder = await capture(
			{ session: "aaaaaaaa", cut: "1", json: true },
			projects,
			cases,
		);

		expect(printedDeclaration(recorder.stdout.join(""))).toMatchObject({
			transcript: { sourceSession: SESSION_ID },
		});
	});

	it("refuses a prefix that matches two sessions, naming both", async () => {
		const cases = await probeCase();
		const other = "aaaaaaaa-9999-9999-9999-999999999999";
		const projects = await probeProjects(SESSION_ID, other);

		const failure = await failureOf(
			capture(
				{ session: "aaaaaaaa", cut: "1", json: true },
				projects,
				cases,
			).then(() => undefined),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			`Session prefix aaaaaaaa matches 2 session files: ${SESSION_ID}, ${other}`,
		);
	});

	it("refuses a prefix that matches no session, naming the prefix", async () => {
		const cases = await probeCase();
		const projects = await probeProjects(SESSION_ID);

		const failure = await failureOf(
			capture(
				{ session: "deadbeef", cut: "1", json: true },
				projects,
				cases,
			).then(() => undefined),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toBe(
			"Session prefix deadbeef matches no session file",
		);
	});

	it.each(["0", "-1", "5"])(
		"refuses a cut of %s as a usage error, naming the index and the line count",
		async (cut) => {
			const cases = await probeCase();
			const projects = await probeProjects(SESSION_ID);

			const failure = await failureOf(
				capture({ session: SESSION_ID, cut, json: true }, projects, cases).then(
					() => undefined,
				),
			);

			expect(failure).toBeInstanceOf(UsageError);
			expect(failure.message).toBe(
				`Cut ${cut} is outside the source's 4 lines`,
			);
		},
	);

	it("refuses a pipeline case as a precondition, naming why", async () => {
		const projects = await probeProjects(SESSION_ID);
		const recorder = recordOutput();

		const failure = await failureOf(
			runCaseCapture(
				{
					caseId: DEFAULT_CASE_ID,
					session: SESSION_ID,
					cut: "1",
					json: true,
				},
				{
					projectsDirectory: projects,
					runsDirectory: join(projects, "no-runs"),
					output: recorder.output,
				},
			),
		);

		expect(failure).toBeInstanceOf(RefusedPreconditionError);
		expect(failure.message).toContain("only a session case");
	});
});
