import { describe, expect, it } from "bun:test";

import inheritedConfigurationFindings from "./comparison-inherited-configuration";

const GATEWAY_A =
	"6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b";

const GATEWAY_B =
	"d4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35";

const BASE_URL_A = { name: "ANTHROPIC_BASE_URL", sha256: GATEWAY_A };

const BASE_URL_B = { name: "ANTHROPIC_BASE_URL", sha256: GATEWAY_B };

const API_KEY = { name: "ANTHROPIC_API_KEY" };

const PROMPT_CACHING_OFF = {
	name: "DISABLE_PROMPT_CACHING",
	sha256: GATEWAY_A,
};

function findsNothingWhenEveryArmInheritedTheSameConfiguration(): void {
	const same = [BASE_URL_A, API_KEY];

	expect(
		inheritedConfigurationFindings({
			baseline: [same, same],
			candidate: [same],
			control: [same],
		}),
	).toEqual([]);
}

function namesEachVariableTwoArmsInheritedDifferently(): void {
	const findings = inheritedConfigurationFindings({
		baseline: [[BASE_URL_A, API_KEY]],
		candidate: [[BASE_URL_B, PROMPT_CACHING_OFF]],
		control: [[BASE_URL_A, API_KEY]],
	});

	expect(findings).toEqual([
		{
			arms: ["candidate", "baseline"],
			kind: "differs",
			variables: [
				{ arm: "baseline", kind: "only", name: "ANTHROPIC_API_KEY" },
				{ kind: "value", name: "ANTHROPIC_BASE_URL" },
				{ arm: "candidate", kind: "only", name: "DISABLE_PROMPT_CACHING" },
			],
		},
		{
			arms: ["candidate", "control"],
			kind: "differs",
			variables: [
				{ arm: "control", kind: "only", name: "ANTHROPIC_API_KEY" },
				{ kind: "value", name: "ANTHROPIC_BASE_URL" },
				{ arm: "candidate", kind: "only", name: "DISABLE_PROMPT_CACHING" },
			],
		},
	]);
}

function namesTheArmsWhoseRecordsDoNotSayWhatTheyInherited(): void {
	expect(
		inheritedConfigurationFindings({
			baseline: [[BASE_URL_A]],
			candidate: [undefined],
			control: [undefined, undefined],
		}),
	).toEqual([{ arms: ["candidate", "control"], kind: "unrecorded" }]);
}

function showsAnArmAsMixedWhenItsGroupsInheritedDifferentConfiguration(): void {
	expect(
		inheritedConfigurationFindings({
			baseline: [[BASE_URL_A]],
			candidate: [[BASE_URL_A, API_KEY], [BASE_URL_B]],
			control: [[BASE_URL_A]],
		}),
	).toEqual([
		{
			arm: "candidate",
			kind: "mixed",
			names: ["ANTHROPIC_API_KEY", "ANTHROPIC_BASE_URL"],
			unrecorded: false,
		},
	]);
}

function showsAnArmAsMixedWhenOnlySomeOfItsGroupsRecordedIt(): void {
	expect(
		inheritedConfigurationFindings({
			baseline: [[BASE_URL_A], undefined],
			candidate: [[BASE_URL_A]],
			control: [[BASE_URL_A]],
		}),
	).toEqual([{ arm: "baseline", kind: "mixed", names: [], unrecorded: true }]);
}

describe(inheritedConfigurationFindings.name, () => {
	it(
		"finds nothing when every arm's records inherited the same configuration",
		findsNothingWhenEveryArmInheritedTheSameConfiguration,
	);

	it(
		"names each variable two arms inherited with different values or only one of them inherited",
		namesEachVariableTwoArmsInheritedDifferently,
	);

	it(
		"names the arms whose records do not say what they inherited",
		namesTheArmsWhoseRecordsDoNotSayWhatTheyInherited,
	);

	it(
		"shows an arm as mixed when its groups inherited different configuration",
		showsAnArmAsMixedWhenItsGroupsInheritedDifferentConfiguration,
	);

	it(
		"shows an arm as mixed when only some of its groups recorded what they inherited",
		showsAnArmAsMixedWhenOnlySomeOfItsGroupsRecordedIt,
	);
});
