import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { sessionAttemptPaths } from "#benchmark/run-layout";
import { CliTestWorkspace } from "#cli/cli-test-support";
import RECORD_JSON_INDENT_SPACES from "#server/json-record-format";

const CAPTURE_CASE_ID = "capture-probe";
const SESSION_ID = "aaaaaaaa-1111-2222-3333-444444444444";
class CaseCaptureFixture {
	public static forEachTest(): CaseCaptureFixture {
		return new CaseCaptureFixture(CliTestWorkspace.forEachTest());
	}
	public constructor(private readonly workspace: Readonly<CliTestWorkspace>) {}
	public async probeCase(): Promise<string> {
		const root = await this.workspace.createDirectory("rehearse-cases-");
		const directory = join(root, CAPTURE_CASE_ID);
		await mkdir(directory, { recursive: true });
		await Bun.write(
			join(directory, "case.json"),
			`${JSON.stringify(
				{
					checks: [
						{ kind: "word-band", max: 1 },
						{ kind: "forbidden-text", strings: ["\u2014"] },
					],
					corpusFiles: ["output-styles/brief.md"],
					id: CAPTURE_CASE_ID,
					kind: "session",
					prompt: "Say the codeword.",
					settings: { outputStyle: "brief" },
					title: "Capture probe",
					tools: [],
				},
				null,
				RECORD_JSON_INDENT_SPACES,
			)}\n`,
		);

		return root;
	}

	public async probeProjects(
		...sessionIds: readonly string[]
	): Promise<string> {
		const directory = await this.workspace.createDirectory(
			"rehearse-capture-cli-",
		);
		const slug = join(directory, "-private-tmp-probe");
		await mkdir(slug, { recursive: true });
		await Array.fromAsync(sessionIds, async (sessionId) => {
			await Bun.write(
				join(slug, `${sessionId}.jsonl`),
				`${[{ ordinal: 0 }, { ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }]
					.map(({ ordinal }) => JSON.stringify({ ordinal, sessionId }))
					.join("\n")}\n`,
			);
		});

		return directory;
	}

	public async probeRuns(sessionId: string): Promise<string> {
		const directory =
			await this.workspace.createDirectory("rehearse-runs-cli-");
		const attempt = sessionAttemptPaths(directory, {
			caseId: CAPTURE_CASE_ID,
			uuid: "8dc2b4b6-0000-0000-0000-000000000000",
		});
		await mkdir(attempt.directory, { recursive: true });
		await Bun.write(
			attempt.transcriptFile,
			`${[{ ordinal: 0 }, { ordinal: 1 }, { ordinal: 2 }, { ordinal: 3 }]
				.map(({ ordinal }) => JSON.stringify({ ordinal, sessionId }))
				.join("\n")}\n`,
		);

		return directory;
	}

	public async emptyProjects(): Promise<string> {
		return await this.workspace.createDirectory("rehearse-projects-cli-");
	}
}

export { CAPTURE_CASE_ID, CaseCaptureFixture, SESSION_ID };
