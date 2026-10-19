import { mkdtemp, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";

import type { SessionAttemptPaths } from "#benchmark/run-layout";
import { STATE_EVIDENCE_DIRECTORY } from "#benchmark/session-state-evidence";
import type { TestResources } from "#benchmark/test-support";

interface RegradeEvidenceOptions {
	readonly tools: readonly string[];
	readonly stateContents: string;
}
class RegradeEvidenceBuilder {
	readonly #options: Partial<RegradeEvidenceOptions>;
	public constructor(options: Partial<RegradeEvidenceOptions> = {}) {
		this.#options = options;
	}
	public async build(resources: Pick<TestResources, "track">): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-regrade-"));
		resources.track(directory);
		if (this.#options.tools !== undefined) {
			await Bun.write(
				join(directory, "transcript.jsonl"),
				this.#options.tools.map((name) => `${toolUseLine(name)}\n`).join(""),
			);
		}
		if (this.#options.stateContents !== undefined) {
			await Bun.write(
				join(directory, STATE_EVIDENCE_DIRECTORY, "left.txt"),
				this.#options.stateContents,
			);
		}

		return directory;
	}
}
function pathsFor(
	directory: string,
): Pick<SessionAttemptPaths, "directory" | "transcriptFile"> {
	return {
		directory,
		transcriptFile: join(directory, "transcript.jsonl"),
	};
}

function sha256Of(text: string): string {
	return new Bun.CryptoHasher("sha256").update(text).digest("hex");
}

function toolUseLine(name: string): string {
	return JSON.stringify({
		message: {
			content: [{ input: {}, name, type: "tool_use" }],
		},
		type: "assistant",
	});
}

async function evidenceDigests(
	attempt: string,
): Promise<Record<string, string>> {
	const entries = await readdir(join(attempt, "state"), {
		recursive: true,
		withFileTypes: true,
	});
	const state = entries
		.filter((entry) => entry.isFile())
		.map((entry) => join(entry.parentPath, entry.name));

	const named = [
		join(attempt, "attempt.json"),
		join(attempt, "transcript.jsonl"),
		...state,
	];
	const digests: Record<string, string> = {};
	await Array.fromAsync(named, async (path) => {
		digests[relative(attempt, path)] = sha256Of(await Bun.file(path).text());
	});

	return digests;
}
export {
	toolUseLine,
	RegradeEvidenceBuilder as default,
	pathsFor,
	sha256Of,
	evidenceDigests,
};
