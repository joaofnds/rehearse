import { chmod, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { runCommand } from "./command";
import { stageJudgeInput } from "./stage-grading-test-fixtures";
import {
	complete,
	envelope,
	progressRubric,
	streamed,
} from "./stage-judge-stream-test-fixtures";
import type { TestResources } from "./test-support";
import { PROJECT_ROOT } from "./test-support";

const EXECUTABLE_FILE_MODE = 0o755;

async function prepareStageJudgeCli(
	testResources: Readonly<TestResources>,
): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-judge-cli-"));
	testResources.track(directory);
	const claude = join(directory, "claude");
	await Bun.write(
		claude,
		'#!/bin/sh\nprintf "%s\\n" "$@" > "$JUDGE_ARGS"\ncat > /dev/null\ncat "$JUDGE_STREAM"\n',
	);
	await chmod(claude, EXECUTABLE_FILE_MODE);
	await Bun.write(
		join(directory, "stream.jsonl"),
		[...streamed(complete), envelope(complete), ""].join("\n"),
	);
	await Bun.write(
		join(directory, "judge.json"),
		JSON.stringify({ input: stageJudgeInput("build"), progressRubric }),
	);
	await Bun.write(
		join(directory, "judge.ts"),
		`import { runStageJudge } from ${JSON.stringify(join(PROJECT_ROOT, "src/benchmark/stage-grading.ts"))};
import { createSpendCeiling } from ${JSON.stringify(join(PROJECT_ROOT, "src/benchmark/spend-ceiling.ts"))};
const { input, progressRubric } = await Bun.file(${JSON.stringify(join(directory, "judge.json"))}).json();
const returned = [];
const budget = { sessionBudgetUsd: 5, spendCeiling: createSpendCeiling({ ceilingUsd: 100 }) };
const scorecard = await runStageJudge(
 { model: "sonnet", effort: undefined, budget },
 { input, source: progressRubric },
 { onProgress: (reading) => {
	returned.push(reading.state === "returning" ? reading.sections.dimensions.returned : -1);
}});
console.log(JSON.stringify({ returned, grade: scorecard.grade.grade }));
`,
	);

	return directory;
}

async function observeStageJudgeCli(
	testResources: Readonly<TestResources>,
): Promise<{ readonly output: string; readonly args: string }> {
	const directory = await prepareStageJudgeCli(testResources);

	const output = await runCommand(
		[process.execPath, join(directory, "judge.ts")],
		directory,
		{
			env: {
				JUDGE_ARGS: join(directory, "args.txt"),
				JUDGE_STREAM: join(directory, "stream.jsonl"),
				PATH: `${directory}:${Bun.env["PATH"] ?? ""}`,
			},
		},
	);

	return { args: await Bun.file(join(directory, "args.txt")).text(), output };
}

export { observeStageJudgeCli as default };
