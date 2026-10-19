import type { SessionCase } from "./case";
import type { ComparisonArm } from "./comparison-record";
import type { Immutable } from "./contracts";
import { PROBE_SKILL } from "./session-comparison-test-contract";
import type { StateCheck } from "./session-state-check";

const SINGLE_REPLY_WORD_LIMIT = 1;

const DOUBLE_REPLY_WORD_LIMIT = 2;

function declaredCorpus(caseId: string, role: ComparisonArm): string[] {
	if (role === "control") {
		return [];
	}

	if (caseId === "case-skill") {
		return ["output-styles/brief.md", PROBE_SKILL];
	}

	return ["output-styles/brief.md"];
}

interface SessionCaseScenario {
	readonly caseId: string;
	readonly role: ComparisonArm;
	readonly stateCheck?: Immutable<StateCheck> | undefined;
}

class SessionComparisonCaseBuilder {
	public constructor(
		private readonly props: Partial<SessionCaseScenario> = {},
	) {}

	public build(): SessionCase {
		const { caseId = "case-one", role = "baseline", stateCheck } = this.props;
		const corpusFiles = declaredCorpus(caseId, role);
		const prompt = caseId === "case-one" ? "Reply OK." : "Reply OK twice.";
		const max =
			caseId === "case-one" ? SINGLE_REPLY_WORD_LIMIT : DOUBLE_REPLY_WORD_LIMIT;
		const checks =
			caseId === "case-three"
				? [
						{ kind: "word-band" as const, max },
						{ kind: "tool-calls" as const, max: 0 },
					]
				: [{ kind: "word-band" as const, max }];
		const declaration = {
			checks,
			corpusFiles,
			id: caseId,
			kind: "session" as const,
			model: "sonnet" as const,
			projectFiles: [],
			prompt,
			sessionBudgetUsd: 0.2,
			stateCheck,
			title: caseId,
			tools: [],
		};

		return {
			agents: undefined,
			checks: declaration.checks,
			corpusFiles,
			declaration,
			fixturePath: undefined,
			kind: "session",
			projectFiles: [],
			prompt,
			settings: undefined,
			stateCheck,
			tools: [],
			transcriptPath: undefined,
		};
	}
}

export { SessionComparisonCaseBuilder as default };
