import { symlink } from "node:fs/promises";
import { join } from "node:path";

import type { SessionCase } from "#benchmark/case";
import { liveCorpusSource } from "#benchmark/corpus-file";
import type { LiveCorpusRoot } from "#benchmark/corpus-file";
import type { SessionRunRequest } from "#cli/session-run-command";

import type SessionAttemptTestFiles from "./session-attempt-test-files";
import { SessionCaseBuilder, config } from "./session-case-test-fixture";
import { fakeClaude } from "./session-provider-test-fixture";
import SessionRunRequestBuilder from "./session-run-request-test-builder";

function styledCase(): SessionCase {
	return new SessionCaseBuilder({
		corpusFiles: ["output-styles/brief.md"],
		declaration: {
			checks: [{ kind: "word-band", max: 1 }],
			corpusFiles: ["output-styles/brief.md"],
			id: "smoke",
			kind: "session",
			projectFiles: [],
			prompt: "Reply with the single word OK.",
			title: "Smoke",
			tools: [],
		},
	}).build();
}
class SessionCorpusFixture {
	public constructor(private readonly files: SessionAttemptTestFiles) {}
	public async corpusDirectory(brief: string): Promise<string> {
		const root = await this.files.temporary("rehearse-corpus-");
		await Bun.write(join(root, "output-styles/brief.md"), brief);

		return root;
	}
	public async liveCorpus(brief: string): Promise<LiveCorpusRoot> {
		const root = await this.files.temporary("rehearse-live-install-");
		const backingRoot = await this.corpusDirectory(brief);
		await symlink(
			join(backingRoot, "output-styles"),
			join(root, "output-styles"),
		);

		return liveCorpusSource({ backingRoot, root });
	}
	public async requestFor(corpus?: string): Promise<SessionRunRequest> {
		const projects = await this.files.temporary("rehearse-projects-");
		const runsDirectory = await this.files.temporary("rehearse-runs-");

		return new SessionRunRequestBuilder({
			config: corpus === undefined ? config : { ...config, corpus },
			projectsDirectory: projects,
			runClaude: fakeClaude(projects, "OK"),
			runsDirectory,
			sessionCase: styledCase(),
		}).build();
	}
}
export { SessionCorpusFixture as default };
