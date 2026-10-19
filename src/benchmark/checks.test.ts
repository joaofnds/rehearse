import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { captureTreatmentChecks, runChecks, runSetup } from "./checks";
import { TestResources } from "./test-support";

const testResources = TestResources.forEachTest();

const ignoreLog = (): undefined => undefined;

const runChecksRunsDeclaredChecksInOrderWithOverlaidEnvironments =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const script = [
			"const path = 'checks.log';",
			"const previous = await Bun.file(path).exists() ? await Bun.file(path).text() : '';",
			String.raw`await Bun.write(path, previous + Bun.env.CHECK_VALUE + ':' + Bun.env.PATH + ':' + (Bun.env.HOME === undefined ? 'missing' : 'host') + '\n');`,
		].join(" ");

		await runChecks(
			source.directory,
			{
				checks: [
					{
						command: [process.execPath, "-e", script],
						env: { CHECK_VALUE: "first", PATH: "first-path" },
					},
					{
						command: [process.execPath, "-e", script],
						env: { CHECK_VALUE: "second", PATH: "second-path" },
					},
				],
				label: "Custom checks",
			},
			ignoreLog,
		);

		expect(await Bun.file(join(source.directory, "checks.log")).text()).toBe(
			"first:first-path:host\nsecond:second-path:host\n",
		);
	};

const runChecksAnnouncesTheLabelThroughTheCallersWriter =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const written: string[] = [];

		await runChecks(
			source.directory,
			{ checks: [{ command: ["bun", "--version"] }], label: "Custom checks" },
			(message) => {
				written.push(message);
			},
		);

		expect(written).toEqual(["\nCustom checks"]);
	};

const captureTreatmentChecksPassesWhenEveryDeclaredCommandSucceeds =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const checks = [
			{ command: ["bun", "-e", "process.exit(0)"] },
			{ command: ["bun", "--version"] },
		];

		const result = await captureTreatmentChecks(
			source.directory,
			checks,
			ignoreLog,
		);

		expect(result).toEqual({
			evidence: [
				{
					claim: "All treatment checks exited successfully",
					path: checks.map(({ command }) => command.join(" ")).join("; "),
					source: "local-checks",
				},
			],
			status: "PASS",
		});
	};

const captureTreatmentChecksNamesTheFailedDeclaredCommandInAuthoritativeEvidence =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const command = ["bun", "-e", "process.exit(7)"];
		const written: string[] = [];

		const result = await captureTreatmentChecks(
			source.directory,
			[{ command }],
			(message) => {
				written.push(message);
			},
		);

		expect(result).toEqual({
			evidence: [
				{
					claim: "Treatment check exited 7",
					path: command.join(" "),
					source: "local-checks",
				},
			],
			status: "FAIL",
		});
		expect(written).toEqual([
			"\nTreatment checks",
			"Treatment check failed: bun -e process.exit(7) exited 7",
		]);
	};

const captureTreatmentChecksNamesADeclaredCommandThatCannotBeLaunched =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const command = ["act-15-command-does-not-exist"];
		const written: string[] = [];

		const result = await captureTreatmentChecks(
			source.directory,
			[{ command }],
			(message) => {
				written.push(message);
			},
		);

		const [observedFirstEvidence] = result.evidence;

		expect(observedFirstEvidence).toEqual({
			claim: "Treatment check exited unknown",
			path: command.join(" "),
			source: "local-checks",
		});
		expect(written).toEqual([
			"\nTreatment checks",
			"Treatment check failed: act-15-command-does-not-exist exited unknown",
		]);
	};

const captureTreatmentChecksAnnouncesItsLabelThroughTheCallersWriter =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const written: string[] = [];

		await captureTreatmentChecks(
			source.directory,
			[{ command: ["bun", "--version"] }],
			(message) => {
				written.push(message);
			},
		);

		expect(written).toEqual(["\nTreatment checks"]);
	};

const runSetupAnnouncesItsLabelThroughTheCallersWriter =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const written: string[] = [];

		await runSetup(
			source.directory,
			[{ command: ["bun", "--version"] }],
			(message) => {
				written.push(message);
			},
		);

		expect(written).toEqual(["\nTarget setup"]);
	};

const runSetupAnnouncesNothingWhenTheTargetDeclaresNoSetup =
	async (): Promise<void> => {
		const source = await testResources.createRepository();
		const written: string[] = [];

		await runSetup(source.directory, undefined, (message) => {
			written.push(message);
		});

		expect(written).toEqual([]);
	};

describe(runChecks.name, () => {
	it(
		"runs declared checks in order with overlaid environments",
		runChecksRunsDeclaredChecksInOrderWithOverlaidEnvironments,
	);

	it(
		"announces the label through the caller's writer",
		runChecksAnnouncesTheLabelThroughTheCallersWriter,
	);
});

describe(captureTreatmentChecks.name, () => {
	it(
		"passes when every declared command succeeds",
		captureTreatmentChecksPassesWhenEveryDeclaredCommandSucceeds,
	);

	it(
		"names the failed declared command in authoritative evidence",
		captureTreatmentChecksNamesTheFailedDeclaredCommandInAuthoritativeEvidence,
	);

	it(
		"names a declared command that cannot be launched",
		captureTreatmentChecksNamesADeclaredCommandThatCannotBeLaunched,
	);

	it(
		"announces its label through the caller's writer",
		captureTreatmentChecksAnnouncesItsLabelThroughTheCallersWriter,
	);
});

describe(runSetup.name, () => {
	it(
		"announces its label through the caller's writer",
		runSetupAnnouncesItsLabelThroughTheCallersWriter,
	);

	it(
		"announces nothing when the target declares no setup",
		runSetupAnnouncesNothingWhenTheTargetDeclaresNoSetup,
	);
});
