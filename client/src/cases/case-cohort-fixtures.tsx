import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";

import type { SessionCase } from "./case-page-fixtures";
import { DIGEST, sessionCase } from "./case-page-fixtures";

const OTHER_COHORT_DIGEST = "b".repeat(SHA256_HEX_CHARACTERS);

function costedCohort(): NonNullable<SessionCase["cohorts"]>[number] {
	const costPerRun = { costed: 1, lacking: 0, meanUsd: 0.5 };
	const firstRun = { corpusDigest: DIGEST, costUsd: 0.5, passed: true };
	return {
		corpusVersion: DIGEST,
		figures: {
			corpusVersion: DIGEST,
			costPerRun,
			counted: 1,
			judged: 1,
			leftOut: 0,
			passed: 1,
			state: "measured",
		},
		members: [
			{
				href: "/attempts/session/brief-reply/first",
				label: "Session first",
				run: firstRun,
				startedAt: "2026-10-01T12:00:00.000Z",
			},
		],
	};
}

function unassessedCohort(): NonNullable<SessionCase["cohorts"]>[number] {
	const otherDigest = OTHER_COHORT_DIGEST;
	const otherRun = {
		corpusDigest: otherDigest,
		costUsd: undefined,
		passed: undefined,
	};
	return {
		corpusVersion: otherDigest,
		figures: {
			corpusVersion: otherDigest,
			costPerRun: { costed: 0, lacking: 1, meanUsd: null },
			counted: 1,
			judged: 0,
			leftOut: 0,
			passed: 0,
			state: "measured",
		},
		members: [
			{
				href: "/attempts/session/brief-reply/other",
				label: "Session other",
				run: otherRun,
				startedAt: null,
			},
		],
	};
}

function cohortDefinition(): NonNullable<SessionCase["definition"]> {
	return {
		corpusFiles: ["skills/brief/SKILL.md"],
		evaluation: {
			source: "case.json · checks / stateCheck",
			state: "available",
			text: '{"checks":[{"kind":"word-band","max":120}]}',
		},
		prompt: {
			source: "case.json · prompt",
			state: "available",
			text: "Write a concise answer about the saved evidence.",
		},
		sessionBudgetUsd: 1,
		tools: ["Read"],
	};
}

function multiCohortCase(): SessionCase {
	return sessionCase({
		cohorts: [costedCohort(), unassessedCohort()],
		definition: cohortDefinition(),
	});
}

function disputedStateCase(): SessionCase {
	const known = {
		corpusDigest: DIGEST,
		costUsd: 0.5,
		passed: true,
		recordedOutcome: "SUCCESSFUL" as const,
		replyChecks: { passed: 1, total: 1 },
		savedState: {
			failed: 18,
			passed: 1,
			state: "assessed" as const,
			total: 19,
		},
	};
	return sessionCase({
		cohorts: [
			{
				corpusVersion: DIGEST,
				figures: { state: "no-runs" },
				members: [
					{
						href: "/attempts/session/brief-reply/disputed",
						label: "Session disputed",
						run: known,
						startedAt: null,
					},
					{
						href: "/attempts/session/brief-reply/legacy",
						label: "Session legacy",
						run: { corpusDigest: DIGEST, costUsd: undefined, passed: true },
						startedAt: null,
					},
				],
			},
		],
	});
}

function largeInventoryCase(corpusFiles: readonly string[]): SessionCase {
	return sessionCase({
		definition: {
			corpusFiles: [...corpusFiles],
			evaluation: {
				source: "case.json · checks",
				state: "available",
				text: "The saved evaluation contract.",
			},
			prompt: {
				source: "case.json · prompt",
				state: "available",
				text: "The useful prompt stays directly available.",
			},
			sessionBudgetUsd: null,
			tools: ["Read"],
		},
	});
}

export {
	disputedStateCase,
	multiCohortCase,
	OTHER_COHORT_DIGEST,
	largeInventoryCase,
};
