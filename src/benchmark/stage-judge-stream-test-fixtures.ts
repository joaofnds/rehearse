import type { StageJudgeResponse } from "./contracts";
import type { JudgeProgress } from "./run-events";

const STREAM_CHUNK_CODE_UNITS = 5;

const FINAL_JUDGE_PROGRESS_EVENT_OFFSET = -1;

function streamed(output: Partial<StageJudgeResponse>): string[] {
	const json = JSON.stringify(output);
	const deltas: string[] = [];
	for (let start = 0; start < json.length; start += STREAM_CHUNK_CODE_UNITS) {
		deltas.push(
			JSON.stringify({
				event: {
					delta: {
						partial_json: json.slice(start, start + STREAM_CHUNK_CODE_UNITS),
						type: "input_json_delta",
					},
					index: 0,
					type: "content_block_delta",
				},
				type: "stream_event",
			}),
		);
	}

	return [
		JSON.stringify({
			event: {
				content_block: {
					input: {},
					name: "StructuredOutput",
					type: "tool_use",
				},
				index: 0,
				type: "content_block_start",
			},
			type: "stream_event",
		}),
		...deltas,
	];
}

function envelope(output: Partial<StageJudgeResponse>): string {
	return JSON.stringify({
		session_id: "judge-session",
		structured_output: output,
		total_cost_usd: 0.1,
		type: "result",
	});
}

const progressRubric = {
	content: "{}",
	rubric: {
		dimensions: [
			{ description: "One", excellent: "e", good: "g", id: "d1" },
			{ description: "Two", excellent: "e", good: "g", id: "d2" },
			{ description: "Three", excellent: "e", good: "g", id: "d3" },
		],
		hardBlockers: [
			{ description: "Blocker one", id: "b1" },
			{ description: "Blocker two", id: "b2" },
		],
		requirements: [{ description: "Requirement", id: "r1" }],
	},
	rubricPath: "rubrics/build.json",
};

const cited: StageJudgeResponse["dimensions"][number]["evidence"][number] = {
	claim: "grounded",
	path: "backlog-seed.md",
	quote: "Task",
	source: "task",
};

const grounded = [cited];

const pass = (id: string): StageJudgeResponse["hardBlockers"][number] => ({
	evidence: grounded,
	id,
	status: "PASS",
});

const graded = (id: string): StageJudgeResponse["dimensions"][number] => ({
	evidence: grounded,
	grade: "A",
	id,
});

const complete = {
	dimensions: [graded("d1"), graded("d2"), graded("d3")],
	hardBlockers: [pass("b1"), pass("b2")],
	requirements: [pass("r1")],
	summary: "graded",
};

function latestItems(
	progress: readonly JudgeProgress[],
): Extract<JudgeProgress, { state: "returning" }>["items"] {
	const latest = progress.at(FINAL_JUDGE_PROGRESS_EVENT_OFFSET);

	return latest?.state === "returning" ? latest.items : undefined;
}

export {
	streamed,
	envelope,
	progressRubric,
	cited,
	pass,
	graded,
	complete,
	latestItems,
};
