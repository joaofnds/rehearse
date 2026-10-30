import type { SessionCase } from "./case";
import type { SessionSettings } from "./claude";

const settings: SessionSettings = {
	budgetUsd: 0.2,
	effort: "low",
	model: "haiku",
};
class SessionLineageCaseBuilder {
	readonly #values: Partial<SessionCase>;
	public constructor(values: Partial<SessionCase> = {}) {
		this.#values = values;
	}
	public build(): SessionCase {
		const { fixturePath, stateCheck } = this.#values;
		return {
			agents: undefined,
			checks: [{ kind: "word-band", max: 1 }],
			corpusFiles: ["output-styles/brief.md"],
			declaration: {
				checks: [{ kind: "word-band", max: 1 }],
				corpusFiles: ["output-styles/brief.md"],
				id: "probe",
				kind: "session",
				projectFiles: [],
				prompt: "Reply with the single word OK.",
				stateCheck,
				title: "Probe",
				tools: [],
			},
			fixturePath,
			isolated: false,
			kind: "session",
			projectFiles: [],
			prompt: "Reply with the single word OK.",
			settings: undefined,
			stateCheck,
			tools: [],
			transcriptPath: undefined,
			...this.#values,
		};
	}
}
export { SessionLineageCaseBuilder, settings };
