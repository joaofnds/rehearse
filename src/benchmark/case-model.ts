import { CaseDeclarationError } from "./case-declaration";
import type {
	PipelineCaseDeclaration,
	SessionCaseDeclaration,
} from "./case-declaration";
import type { Immutable, StageRubric } from "./contracts";
import type { JsonObject } from "./json-value";
import type { PipelineDefinition } from "./pipeline";
import type { Check } from "./session-check";
import type { StateCheck } from "./session-state-check";

interface LoadedStageRubric {
	readonly rubricPath: string;
	readonly content: string;
	readonly rubric: StageRubric;
}

interface BenchmarkCase {
	readonly kind: "pipeline";
	readonly declaration: PipelineCaseDeclaration;
	readonly task: string;
	readonly productBrief: string;
	readonly finalRubric: string;
	readonly finalRubricPath: string;
	readonly rubricsDirectory: string;
	readonly pipelinePath: string;
	readonly pipeline: PipelineDefinition;
	readonly stageRubrics: Readonly<Record<string, LoadedStageRubric>>;
	readonly targetPath: string;
	readonly settingsFilePath: string;
}

interface SessionCase {
	readonly kind: "session";
	readonly declaration: SessionCaseDeclaration;
	readonly fixturePath: string | undefined;
	readonly transcriptPath: string | undefined;
	readonly prompt: string;
	readonly tools: readonly string[];
	readonly settings: Immutable<JsonObject> | undefined;
	readonly agents: Immutable<JsonObject> | undefined;
	readonly corpusFiles: readonly string[];
	readonly projectFiles: readonly string[];
	readonly checks: Immutable<readonly Check[]>;
	readonly stateCheck?: Immutable<StateCheck> | undefined;
}

type LoadedCase = BenchmarkCase | SessionCase;

function requirePipelineCase(loaded: LoadedCase): BenchmarkCase {
	if (loaded.kind !== "pipeline") {
		throw new CaseDeclarationError(
			`Case ${loaded.declaration.id} is a session case; this command takes a pipeline case`,
		);
	}

	return loaded;
}

function requireSessionCase(loaded: LoadedCase): SessionCase {
	if (loaded.kind !== "session") {
		throw new CaseDeclarationError(
			`Case ${loaded.declaration.id} is a pipeline case; this command takes a session case`,
		);
	}

	return loaded;
}

export { requirePipelineCase, requireSessionCase };
export type { LoadedStageRubric, BenchmarkCase, SessionCase, LoadedCase };
