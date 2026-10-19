import { z } from "zod";

const FIXTURE_DIRECTORY = new URL(
	"__fixtures__/judge-prompts/",
	import.meta.url,
);
const stringsSchema = z.array(z.string());
const fileHashesSchema = z.array(
	z.object({ path: z.string(), sha256: z.string() }),
);
const corpusVersionSchema = z.object({
	digest: z.string(),
	kind: z.literal("version"),
});
const buildStateSchema = z.object({
	commitSubjects: stringsSchema,
	diff: z.string(),
	resultSha: z.string(),
});
const candidateStateSchema = z.object({
	changedPaths: stringsSchema,
	diff: z.string(),
	resultSha: z.string(),
});
const planningStateSchema = z.object({
	changedPaths: stringsSchema,
	commitSubjects: stringsSchema,
	diff: z.string(),
	resultSha: z.string(),
	taskState: z.string(),
});
const stageStateSchema = z.object({
	build: buildStateSchema,
	candidate: candidateStateSchema,
	changedPaths: stringsSchema,
	corpusFiles: fileHashesSchema,
	corpusVersion: corpusVersionSchema,
	planning: planningStateSchema,
	taskCard: z.string(),
	taskOutput: z.string(),
});

async function stageState(): Promise<z.infer<typeof stageStateSchema>> {
	return stageStateSchema.parse(
		await Bun.file(new URL("stage-state.json", FIXTURE_DIRECTORY)).json(),
	);
}

async function promptBuildState(): Promise<z.infer<typeof buildStateSchema>> {
	const state = await stageState();
	return state.build;
}

async function promptPlanningState(): Promise<
	z.infer<typeof planningStateSchema>
> {
	const state = await stageState();
	return state.planning;
}

async function promptCandidateState(): Promise<
	z.infer<typeof candidateStateSchema>
> {
	const state = await stageState();
	return state.candidate;
}

async function promptCorpusFiles(): Promise<z.infer<typeof fileHashesSchema>> {
	const state = await stageState();
	return state.corpusFiles;
}

async function promptChangedPaths(): Promise<z.infer<typeof stringsSchema>> {
	const state = await stageState();
	return state.changedPaths;
}

async function promptCorpusVersion(): Promise<
	z.infer<typeof corpusVersionSchema>
> {
	const state = await stageState();
	return state.corpusVersion;
}

async function promptTaskCard(): Promise<string> {
	const state = await stageState();
	return state.taskCard;
}

async function promptTaskOutput(): Promise<string> {
	const state = await stageState();
	return state.taskOutput;
}

async function readPromptFixture(filename: string): Promise<string> {
	const text = await Bun.file(new URL(filename, FIXTURE_DIRECTORY)).text();
	return text;
}

export {
	promptBuildState,
	promptPlanningState,
	promptCandidateState,
	promptCorpusFiles,
	promptChangedPaths,
	promptCorpusVersion,
	promptTaskCard,
	promptTaskOutput,
	readPromptFixture,
};
