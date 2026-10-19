import { describe, expect, it } from "bun:test";

import { STAGE_SILENCE_LIMIT_MS } from "./config";
import { runWorkflowStage } from "./workflow";
import {
	questionTurn,
	queuedResponses,
	stageResult,
	testResources,
	workflowStageRequest,
} from "./workflow-test-fixtures";

testResources.registerCleanup();

const OPTION_VALUE_POSITION_OFFSET = 1;

const STREAM_OUTPUT_ARGUMENT_COUNT = 4;

const FALLBACK_ARGUMENT_SCAN_START_INDEX = 0;
const MISSING_ARGUMENT_INDEX = -1;

async function runsTheStageSSessionWithTheEnvironmentTheRequestNames(): Promise<void> {
	const environments: unknown[] = [];

	await runWorkflowStage(
		workflowStageRequest({
			environment: { DATABASE_URL: "postgres://127.0.0.1:49152/app" },
			skill: "build",
			stage: "build",
		}),
		async (_command, _directory, options) => {
			environments.push(options.env);

			return await Promise.resolve(
				JSON.stringify({
					session_id: "stage-session",
					structured_output: { message: "Built", status: "COMPLETE" },
					total_cost_usd: 0.1,
					type: "result",
				}),
			);
		},
	);

	expect(environments).toEqual([
		{ DATABASE_URL: "postgres://127.0.0.1:49152/app" },
	]);
}

async function startsTheStageSSessionUnderTheIdTheRequestNames(): Promise<void> {
	const commands: (readonly string[])[] = [];

	await runWorkflowStage(workflowStageRequest(), async (command) => {
		commands.push(command);

		return await Promise.resolve(
			JSON.stringify({
				session_id: "stage-session",
				structured_output: { message: "Shaped", status: "COMPLETE" },
				total_cost_usd: 0.1,
				type: "result",
			}),
		);
	});

	const [first] = commands;

	expect(
		first?.[
			(first?.indexOf("--session-id") ?? FALLBACK_ARGUMENT_SCAN_START_INDEX) +
				OPTION_VALUE_POSITION_OFFSET
		],
	).toBe("stage-session");
}

async function streamsTheStageCallUnderASilenceLimitAloneAndReadsTheResultLineItsRunnerReturns(): Promise<void> {
	const calls: {
		readonly command: readonly string[];
		readonly options: object;
	}[] = [];

	const transcript = await runWorkflowStage(
		workflowStageRequest({ skill: "build", stage: "build", taskId: "ACT-347" }),
		async (command, _directory, options) => {
			calls.push({ command, options });

			return await Promise.resolve(
				JSON.stringify({
					session_id: "worker-session",
					structured_output: { message: "Built", status: "COMPLETE" },
					total_cost_usd: 0.4,
					type: "result",
				}),
			);
		},
	);

	const [call] = calls;
	const format =
		call?.command.indexOf("--output-format") ?? MISSING_ARGUMENT_INDEX;

	expect(
		call?.command.slice(format, format + STREAM_OUTPUT_ARGUMENT_COUNT),
	).toEqual(["--output-format", "stream-json", "--verbose", "--json-schema"]);
	expect(call?.options).toEqual({ silenceLimitMs: STAGE_SILENCE_LIMIT_MS });
	expect(transcript).toMatchObject({
		costUsd: 0.4,
		exchanges: [{ agent: { message: "Built", status: "COMPLETE" } }],
		sessionId: "worker-session",
	});
}

async function restrictsAStageSessionToProjectLevelSettingsWhenAsked(): Promise<void> {
	const commands: string[][] = [];

	await runWorkflowStage(
		workflowStageRequest({ settingSources: "project", taskId: "ACT-28" }),
		async (command) => {
			commands.push([...command]);

			return await Promise.resolve(
				JSON.stringify({
					session_id: "worker-session",
					structured_output: { message: "Shaped", status: "COMPLETE" },
					type: "result",
				}),
			);
		},
	);

	const [observedFirstCommand] = commands;

	expect(observedFirstCommand).toContain("--setting-sources");
}

async function leavesAStageSessionUnrestrictedByDefault(): Promise<void> {
	const commands: string[][] = [];

	await runWorkflowStage(
		workflowStageRequest({ taskId: "ACT-28" }),
		async (command) => {
			commands.push([...command]);

			return await Promise.resolve(
				JSON.stringify({
					session_id: "worker-session",
					structured_output: { message: "Shaped", status: "COMPLETE" },
					type: "result",
				}),
			);
		},
	);

	const [observedFirstCommand] = commands;

	expect(observedFirstCommand).not.toContain("--setting-sources");
}

async function passesADeclaredSettingsOverlayThroughToTheSession(): Promise<void> {
	const commands: string[][] = [];

	await runWorkflowStage(
		workflowStageRequest({
			settingsOverlay: '{"disableAllHooks":true}',
			taskId: "ACT-28",
		}),
		async (command) => {
			commands.push([...command]);

			return await Promise.resolve(
				JSON.stringify({
					session_id: "worker-session",
					structured_output: { message: "Shaped", status: "COMPLETE" },
					type: "result",
				}),
			);
		},
	);

	const [observedFirstCommand] = commands;

	expect(observedFirstCommand).toContain("--settings");
	expect(
		observedFirstCommand?.[
			observedFirstCommand.indexOf("--settings") + OPTION_VALUE_POSITION_OFFSET
		],
	).toBe('{"disableAllHooks":true}');
}

async function keepsTheInitialStageConfigurationAcrossCallbacks(): Promise<void> {
	const request = { ...workflowStageRequest() };
	const commands: string[][] = [];
	const respond = queuedResponses([
		questionTurn({ totalCostUsd: 0.2 }),
		stageResult({ totalCostUsd: 0.3 }),
	]);

	await runWorkflowStage(request, async (command, directory, options) => {
		commands.push([...command]);
		request.model = "haiku";
		request.skill = "build";

		return await respond(command, directory, options);
	});

	expect(
		commands.map(
			(command) =>
				command[command.indexOf("--model") + OPTION_VALUE_POSITION_OFFSET],
		),
	).toEqual(["sonnet", "sonnet"]);
}

describe("workflow provider metrics", () => {
	it(
		"keeps the initial stage configuration across callbacks",
		keepsTheInitialStageConfigurationAcrossCallbacks,
	);
	it(
		"runs the stage's session with the environment the request names",
		runsTheStageSSessionWithTheEnvironmentTheRequestNames,
	);
	it(
		"starts the stage's session under the id the request names",
		startsTheStageSSessionUnderTheIdTheRequestNames,
	);
	it(
		"streams the stage call under a silence limit alone and reads the result line its runner returns",
		streamsTheStageCallUnderASilenceLimitAloneAndReadsTheResultLineItsRunnerReturns,
	);
	it(
		"restricts a stage session to project-level settings when asked",
		restrictsAStageSessionToProjectLevelSettingsWhenAsked,
	);
	it(
		"leaves a stage session unrestricted by default",
		leavesAStageSessionUnrestrictedByDefault,
	);
	it(
		"passes a declared settings overlay through to the session",
		passesADeclaredSettingsOverlayThroughToTheSession,
	);
});
