import type { SessionCase } from "#benchmark/case";

interface RegradeCaseOptions {
	readonly checks: SessionCase["checks"];
	readonly stateScorer: "preserve" | "overwrite";
}
class RegradeCaseBuilder {
	readonly #options: Partial<RegradeCaseOptions>;
	public constructor(options: Partial<RegradeCaseOptions> = {}) {
		this.#options = options;
	}
	public build(): SessionCase {
		const declared = RegradeCaseBuilder.caseWithChecks(
			this.#options.checks ?? [],
		);
		if (this.#options.stateScorer === undefined) {
			return declared;
		}

		const report = String.raw`printf '{"results":[{"name":"left-a-file","status":"PASS","detail":"%s"}]}' "$(tr -d '\n' < left.txt)"`;
		const stateCheck = {
			command: [
				"sh",
				"-c",
				this.#options.stateScorer === "overwrite"
					? `${report}; printf overwritten > left.txt; printf planted > planted.txt`
					: report,
			],
			outcomes: ["left-a-file"],
		};

		return {
			...declared,
			declaration: { ...declared.declaration, stateCheck },
			stateCheck,
		};
	}
	private static caseWithChecks(checks: SessionCase["checks"]): SessionCase {
		return {
			agents: undefined,
			checks,
			corpusFiles: ["CLAUDE.md"],
			declaration: {
				checks,
				corpusFiles: ["CLAUDE.md"],
				id: "smoke",
				kind: "session",
				projectFiles: [],
				prompt: "write the reply",
				title: "smoke",
				tools: [],
			},
			fixturePath: undefined,
			isolated: false,
			kind: "session",
			projectFiles: [],
			prompt: "write the reply",
			settings: undefined,
			tools: [],
			transcriptPath: undefined,
		};
	}
}
export default RegradeCaseBuilder;
