import { expect, it } from "bun:test";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const invalidRubricScript = `import { runJudge } from ${JSON.stringify(new URL("judge.ts", import.meta.url).href)};
import { createSpendCeiling } from ${JSON.stringify(new URL("spend-ceiling.ts", import.meta.url).href)};
let rejected = false;
try {
 await runJudge(
  { model: "sonnet", effort: undefined, budget: { sessionBudgetUsd: 5, spendCeiling: createSpendCeiling({ ceilingUsd: 100 }) } },
  { rubric: "", baselineContext: [], diff: "", changedPaths: [], checkIntegrity: { status: "PASS", evidence: [] }, localChecks: { status: "PASS", evidence: [] } },
  async () => { throw new Error("Invalid rubric reached the provider"); },
 );
} catch (error) {
 if (!(error instanceof Error) || error.message !== "Rubric must contain unique requirement IDs") {
  throw error;
 }
 rejected = true;
}
if (!rejected) {
 throw new Error("Invalid rubric was accepted");
}
`;

const unavailableStageRubricScript = `import { runStageJudge } from ${JSON.stringify(new URL("stage-grading.ts", import.meta.url).href)};
import { createSpendCeiling } from ${JSON.stringify(new URL("spend-ceiling.ts", import.meta.url).href)};
let rejected = false;
try {
 await runStageJudge(
  { model: "sonnet", effort: undefined, budget: { sessionBudgetUsd: 5, spendCeiling: createSpendCeiling({ ceilingUsd: 100 }) } },
  {
   input: { stage: "planning", kind: "planning", task: "Task", productBrief: "Brief", instructions: "Instructions", baselineContext: [], taskState: "{}", transcript: { stage: "planning", sessionId: "session", costUsd: 0, providerCalls: [], exchanges: [] }, priorArtifacts: [] },
   source: { rubricPath: "rubric.json", get content() { throw new Error("Unavailable stage rubric"); }, rubric: { hardBlockers: [], requirements: [], dimensions: [] } },
  },
  { invoke: async () => { throw new Error("Unavailable rubric reached the provider"); } },
 );
} catch (error) {
 if (!(error instanceof Error) || error.message !== "Unavailable stage rubric") {
  throw error;
 }
 rejected = true;
}
if (!rejected) {
 throw new Error("Unavailable rubric was accepted");
}
`;

async function observeSetupFailure(script: string): Promise<{
	readonly code: number;
	readonly stdout: string;
	readonly stderr: string;
	readonly remainingEntries: readonly string[];
}> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-judge-lifetime-"));
	try {
		const child = Bun.spawn([process.execPath, "-e", script], {
			env: { ...Bun.env, PATH: directory, TMPDIR: directory },
			stderr: "pipe",
			stdout: "pipe",
		});
		const [code, stdout, stderr] = await Promise.all([
			child.exited,
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);
		return { code, remainingEntries: await readdir(directory), stderr, stdout };
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
}

it("releases the final judge directory when rubric validation fails before invocation", async () => {
	expect(await observeSetupFailure(invalidRubricScript)).toEqual({
		code: 0,
		remainingEntries: [],
		stderr: "",
		stdout: "",
	});
});

it("releases the stage judge directory when prompt preparation fails before invocation", async () => {
	expect(await observeSetupFailure(unavailableStageRubricScript)).toEqual({
		code: 0,
		remainingEntries: [],
		stderr: "",
		stdout: "",
	});
});
