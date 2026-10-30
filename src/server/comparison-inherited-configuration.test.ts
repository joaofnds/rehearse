import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";

import { CASE_ID, groupIdFor } from "#benchmark/compare-attempts-test-support";
import {
	GATEWAY_A,
	GATEWAY_B,
} from "#benchmark/comparison-inherited-configuration-test-fixture";
import { COMPARISON_ARMS } from "#benchmark/comparison-record";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import { writtenFixture } from "#server/comparison-endpoint-test-fixture";
import {
	caseInheritedConfiguration,
	recordGroupConfiguration,
	writeSessionAttempts,
} from "#server/comparison-inherited-configuration-test-fixture";
import {
	clearProvenanceRoots,
	comparedArms,
} from "#server/comparison-provenance-test-fixture";
import { rewriteFixtureAsSession } from "#server/comparison-report-modes-test-fixture";
import ComparisonHarness from "#server/comparison-test-harness";

const ready = Promise.withResolvers<ComparisonHarness>();

async function namesWhatStageArmsInheritedDifferently(): Promise<void> {
	const harness = await ready.promise;
	const { digest } = await comparedArms(harness.runsDirectory);
	await Array.fromAsync(COMPARISON_ARMS, async (role) => {
		await recordGroupConfiguration(
			harness.runsDirectory,
			role,
			role === "candidate" ? GATEWAY_B : GATEWAY_A,
		);
	});

	expect(await caseInheritedConfiguration(harness, digest, CASE_ID)).toEqual({
		findings: [
			{
				arms: ["candidate", "baseline"],
				kind: "differs",
				variables: [{ kind: "value", name: "ANTHROPIC_BASE_URL" }],
			},
			{
				arms: ["candidate", "control"],
				kind: "differs",
				variables: [{ kind: "value", name: "ANTHROPIC_BASE_URL" }],
			},
		],
		state: "available",
	});
}

async function namesWhatSessionArmsInheritedDifferently(): Promise<void> {
	const harness = await ready.promise;
	const fixture = await writtenFixture(harness.runsDirectory);
	await rewriteFixtureAsSession(fixture);
	await writeSessionAttempts(
		harness.runsDirectory,
		fixture.comparisonDigest,
		(role) => (role === "control" ? GATEWAY_B : GATEWAY_A),
	);

	expect(
		await caseInheritedConfiguration(
			harness,
			fixture.comparisonDigest,
			"case-1",
		),
	).toEqual({
		findings: [
			{
				arms: ["baseline", "control"],
				kind: "differs",
				variables: [{ kind: "value", name: "ANTHROPIC_BASE_URL" }],
			},
			{
				arms: ["candidate", "control"],
				kind: "differs",
				variables: [{ kind: "value", name: "ANTHROPIC_BASE_URL" }],
			},
		],
		state: "available",
	});
}

async function servesTheReadingUnavailable(): Promise<void> {
	const harness = await ready.promise;
	const { digest } = await comparedArms(harness.runsDirectory);
	await Bun.write(
		confirmationGroupPaths(harness.runsDirectory, groupIdFor("baseline"))
			.groupFile,
		"{}\n",
	);

	expect(
		await caseInheritedConfiguration(harness, digest, CASE_ID),
	).toMatchObject({ state: "unavailable" });
}

afterEach(clearProvenanceRoots);

describe("GET /api/comparisons/:digest", () => {
	beforeAll(async () => {
		await ComparisonHarness.setup().then(ready.resolve, ready.reject);
	});
	beforeEach(async () => {
		const harness = await ready.promise;
		await harness.reset();
	});
	afterAll(async () => {
		const harness = await ready.promise;
		await harness.teardown();
	});

	it(
		"names the variables a stage comparison's arms inherited differently",
		namesWhatStageArmsInheritedDifferently,
	);

	it(
		"names the variables a session comparison's arms' sessions inherited differently",
		namesWhatSessionArmsInheritedDifferently,
	);

	describe("when an arm's records cannot be read", () => {
		it(
			"serves the comparison with the reading unavailable",
			servesTheReadingUnavailable,
		);
	});
});
