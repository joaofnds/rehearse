import { describe, expect, it } from "bun:test";

import type { BenchmarkCase } from "#benchmark/case";
import { corpusLayoutRoots } from "#benchmark/checkpoint";
import { parseArgs } from "#benchmark/config";
import { buildConfirmationRequest } from "#cli/run-command";
import {
	GIT_SHA1_HEX_DIGITS,
	SHA256_HEX_DIGITS,
} from "#server/digest-test-support";

import {
	BenchmarkCaseBuilder,
	args,
	auditLogCase,
} from "./run-command-test-fixture";

const loadedSettings = {
	hashed: {
		path: "/control/stage-settings.json",
		sha256: "a".repeat(SHA256_HEX_DIGITS),
	},
	json: "{}",
};

function namesTheCaseTheLoadedCaseDeclares(): void {
	const followUp: BenchmarkCase = new BenchmarkCaseBuilder({
		declaration: { ...auditLogCase.declaration, id: "audit-log-follow-up" },
	}).build();

	const request = buildConfirmationRequest({
		benchmarkCase: followUp,
		config: {
			...parseArgs(
				args,
				{},
				{
					caseId: "audit-log-follow-up",
					pipelinePath: auditLogCase.pipelinePath,
					targetPath: auditLogCase.targetPath,
				},
			),
			caseId: "audit-log-follow-up",
		},
		confirmation: {
			approvalMethod: "yes",
			projectedCost: {
				perRepMaximumUsd: 1,
				reps: 2,
				totalMaximumUsd: 2,
			},
			reps: 2,
		},
		controlSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
		corpusSource: { backingRoot: "/backing", kind: "live", root: "/live" },
		instructions: "Frozen instructions\n",
		loadedSettings,
		source: {
			origin: undefined,
			root: "/target",
			sha: "b".repeat(GIT_SHA1_HEX_DIGITS),
		},
		spendCeilingUsd: 100,
	});

	expect(request.caseId).toBe("audit-log-follow-up");
}

function searchesTheTargetSCorpusLayoutNotTheControl(): void {
	const request = buildConfirmationRequest({
		benchmarkCase: auditLogCase,
		config: parseArgs(
			args,
			{},
			{
				caseId: "audit-log",
				pipelinePath: auditLogCase.pipelinePath,
				targetPath: auditLogCase.targetPath,
			},
		),
		confirmation: {
			approvalMethod: "yes",
			projectedCost: { perRepMaximumUsd: 1, reps: 2, totalMaximumUsd: 2 },
			reps: 2,
		},
		controlSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
		corpusSource: { backingRoot: "/backing", kind: "live", root: "/live" },
		instructions: "Frozen instructions\n",
		loadedSettings,
		source: {
			origin: undefined,
			root: "/target",
			sha: "b".repeat(GIT_SHA1_HEX_DIGITS),
		},
		spendCeilingUsd: 100,
	});

	expect(request.corpusRoots).toEqual(
		corpusLayoutRoots("/target", {
			backingRoot: "/backing",
			kind: "live",
			root: "/live",
		}),
	);
}

function carriesTheLoadedSettingsFileThroughToTheConfirmation(): void {
	const declaredSettings = {
		hashed: {
			path: "/control/stage-settings.json",
			sha256: "a".repeat(SHA256_HEX_DIGITS),
		},
		json: '{"disableAllHooks":true}',
	};

	const request = buildConfirmationRequest({
		benchmarkCase: auditLogCase,
		config: parseArgs(
			args,
			{},
			{
				caseId: "audit-log",
				pipelinePath: auditLogCase.pipelinePath,
				targetPath: auditLogCase.targetPath,
			},
		),
		confirmation: {
			approvalMethod: "yes",
			projectedCost: { perRepMaximumUsd: 1, reps: 2, totalMaximumUsd: 2 },
			reps: 2,
		},
		controlSha: "a".repeat(GIT_SHA1_HEX_DIGITS),
		corpusSource: { backingRoot: "/backing", kind: "live", root: "/live" },
		instructions: "Frozen instructions\n",
		loadedSettings: declaredSettings,
		source: {
			origin: undefined,
			root: "/target",
			sha: "b".repeat(GIT_SHA1_HEX_DIGITS),
		},
		spendCeilingUsd: 100,
	});

	expect(request.loadedSettings).toEqual(declaredSettings);
}

describe(buildConfirmationRequest.name, () => {
	it(
		"names the case the loaded case declares",
		namesTheCaseTheLoadedCaseDeclares,
	);
	it(
		"searches the target's corpus layout, not the control repository's",
		searchesTheTargetSCorpusLayoutNotTheControl,
	);
	it(
		"carries the loaded settings file through to the confirmation request",
		carriesTheLoadedSettingsFileThroughToTheConfirmation,
	);
});
