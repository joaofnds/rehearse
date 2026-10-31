import {
	afterEach,
	beforeEach,
	describe,
	expect,
	it,
	setDefaultTimeout,
} from "bun:test";
import { mkdir, rm } from "node:fs/promises";

import { EXIT_CODES } from "#benchmark/exit-codes";
import { ANSWER } from "#benchmark/root-cause-analysis-provider-test-fixtures";
import {
	RUN as DIAGNOSED_RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";

import { CLI_TEST_TIMEOUT_MS, runCli } from "./cli-process-test-driver";
import { providerShim } from "./cli-provider-test-fixture";
import { settingsRecords } from "./cli-spend-test-fixture";

setDefaultTimeout(CLI_TEST_TIMEOUT_MS);

const { records, environment: inRecords } = settingsRecords();

const ESC_CODE_POINT = 27;
const BEL_CODE_POINT = 7;
const CSI_CODE_POINT = 155;
const RIGHT_TO_LEFT_OVERRIDE_CODE_POINT = 8238;

const ESC = String.fromCodePoint(ESC_CODE_POINT);
const BEL = String.fromCodePoint(BEL_CODE_POINT);
const CSI = String.fromCodePoint(CSI_CODE_POINT);
const RIGHT_TO_LEFT_OVERRIDE = String.fromCodePoint(
	RIGHT_TO_LEFT_OVERRIDE_CODE_POINT,
);

const HOSTILE_STAGE = `sh${ESC}[31mape${BEL}${CSI}${RIGHT_TO_LEFT_OVERRIDE}\n`;

const RAW_CONTROL = /[\p{Cc}\p{Bidi_Control}]/u;

const FAILURE_PREFIX = "The root-cause analysis failed:";

const FREE_CALL_COST_USD = 0;

const [NOT_A_FACTOR_STAGE, ROOT_CAUSE_STAGE] = ANSWER.stages;

function answerNamingAHostileStage(): string {
	return JSON.stringify({
		is_error: false,
		session_id: "analysis-session",
		structured_output: {
			...ANSWER,
			stages: [
				{ ...NOT_A_FACTOR_STAGE, stage: HOSTILE_STAGE },
				ROOT_CAUSE_STAGE,
			],
		},
		subtype: "success",
		total_cost_usd: FREE_CALL_COST_USD,
		type: "result",
	});
}

async function diagnose(
	...options: readonly string[]
): ReturnType<typeof runCli> {
	const binDirectory = await providerShim({
		directory: records,
		onCall: [
			"cat >/dev/null",
			"cat <<'ENVELOPE'",
			answerNamingAHostileStage(),
			"ENVELOPE",
			"exit 0",
		],
	});

	return await runCli(
		["diagnose", DIAGNOSED_RUN, "--model", "sonnet", ...options],
		"empty",
		{ ...inRecords(), PATH: `${binDirectory}:${Bun.env["PATH"] ?? ""}` },
	);
}

async function escapesThemInTheFailureLine(): Promise<void> {
	const result = await diagnose();

	const failureLine = result.stderr
		.split("\n")
		.find((line) => line.startsWith(FAILURE_PREFIX));
	expect(result.exitCode).not.toBe(EXIT_CODES.success);
	expect(failureLine).toContain(
		String.raw`sh\u001b[31mape\u0007\u009b\u202e\u000a`,
	);
	expect(failureLine).not.toMatch(RAW_CONTROL);
}

describe("diagnose", () => {
	beforeEach(async () => {
		await mkdir(records, { recursive: true });
		await runStoppedAtBuild(records);
		await runCli(
			["settings", "--spend-ceiling-usd", "30"],
			"empty",
			inRecords(),
		);
	});
	afterEach(async () => {
		await rm(records, { force: true, recursive: true });
	});
	describe("when the model's answer holds control characters", () => {
		it("escapes them in the failure line", escapesThemInTheFailureLine);
	});
});
