import { basename, dirname } from "node:path";

import { compareAttempts } from "#benchmark/compare-attempts";
import { RecordedArms } from "#benchmark/compare-attempts-test-support";
import { unhandled } from "#benchmark/contracts";
import {
	RUN,
	runStoppedAtBuild,
} from "#benchmark/root-cause-analysis-test-support";

import type LaunchHttpDriver from "./launch-http-test-driver";
import {
	LaunchFixture,
	recordedRunWithCheckpoint,
} from "./launch-http-test-fixture";
import type { LaunchRequest } from "./launches-contract";

interface PreparedLaunch {
	readonly driver: LaunchHttpDriver;
	readonly request: LaunchRequest;
}

interface RecordedComparisonArms {
	readonly arms: RecordedArms;
	readonly armA: string;
	readonly armB: string;
}

class LaunchSpendRequestFixture {
	private readonly workspace = new LaunchFixture();

	public async prepare(kind: LaunchRequest["kind"]): Promise<PreparedLaunch> {
		const driver = await this.workspace.harness("missing");
		const request = await this.requestFor(kind, driver.runsDirectory);

		return { driver, request };
	}

	private async requestFor(
		kind: LaunchRequest["kind"],
		runsDirectory: string,
	): Promise<LaunchRequest> {
		switch (kind) {
			case "case": {
				return { attempts: 1, caseId: "pipe-case", kind };
			}
			case "replay": {
				return {
					attempts: 1,
					kind,
					run: await recordedRunWithCheckpoint(runsDirectory, "recorded"),
					stage: "discuss",
				};
			}
			case "analysis": {
				await runStoppedAtBuild(runsDirectory);
				return { kind, run: RUN, statedUsd: 1 };
			}
			case "comparison": {
				const { armA, armB } = await this.recordArms(runsDirectory);
				return { armA, armB, kind };
			}
			case "extension": {
				return await this.extensionRequest(runsDirectory);
			}
			default: {
				return unhandled(kind, "launch request kind");
			}
		}
	}

	private async recordArms(
		runsDirectory: string,
	): Promise<RecordedComparisonArms> {
		const arms = await RecordedArms.create(
			runsDirectory,
			await this.workspace.temporaryDirectory("rehearse-launch-spend-arms-"),
		);
		const common = {
			"CLAUDE.md": "global instructions\n",
			"skills/review/SKILL.md": "review\n",
		};
		const armA = await arms.recordArm("baseline", {
			...common,
			"skills/build/SKILL.md": "build\n",
		});
		const armB = await arms.recordArm("candidate", {
			...common,
			"skills/build/SKILL.md": "revised build\n",
		});
		await arms.readInStage(armA, "skills/build/SKILL.md");
		await arms.readInStage(armB, "skills/build/SKILL.md");

		return { armA, armB, arms };
	}

	private async extensionRequest(
		runsDirectory: string,
	): Promise<Extract<LaunchRequest, { kind: "extension" }>> {
		const { armA, armB, arms } = await this.recordArms(runsDirectory);
		const { reportFile } = await compareAttempts(
			{ armA, armB, runsDirectory },
			{ runBaselineGroup: arms.runBaselineGroup },
		);

		return {
			attempts: 2,
			comparison: basename(dirname(reportFile)),
			kind: "extension",
			statedUsd: 9,
		};
	}

	public async dispose(): Promise<void> {
		await this.workspace.dispose();
	}
}

export { LaunchSpendRequestFixture as default };
