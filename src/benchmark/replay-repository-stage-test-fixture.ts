import { createHash } from "node:crypto";
import { join } from "node:path";

import { assertPlanningStageCompleted } from "./backlog";
import type { CorpusMeasurement } from "./corpus-measurement";
import type { ReplayDependencies } from "./replay";
import { harnessResult } from "./test-support";

const SHA256_HEX_DIGITS = 64;
class ReplayRepositoryStage {
	readonly #artifactContent: string;
	public constructor(
		options: Partial<{ readonly artifactContent: string }> = {},
	) {
		this.#artifactContent = options.artifactContent ?? "replayed spec\n";
	}
	public readonly dependencies: ReplayDependencies["stageSession"] = {
		assertBuildCommitted: async () =>
			await Promise.reject(new Error("not a delivery stage")),
		assertPlanningStageCompleted,
		captureBuildCandidate: async () =>
			await Promise.reject(new Error("not a delivery stage")),
		captureCheckIntegrity: async () =>
			await Promise.resolve(harnessResult("PASS", "checks match")),
		captureStageCorpus: async (skill) =>
			await Promise.resolve([
				{
					path: `skills/${skill}/SKILL.md`,
					sha256: createHash("sha256").update(skill).digest("hex"),
				},
			]),
		captureTreatmentChecks: async () =>
			await Promise.resolve(harnessResult("PASS", "all green")),
		changedPathsBetween: async () => await Promise.resolve([]),
		corpusVersionFiles: async () => await Promise.resolve([]),
		measureCorpus: async () =>
			await Promise.resolve<CorpusMeasurement>({
				digest: "c".repeat(SHA256_HEX_DIGITS),
				kind: "version",
			}),
		readTaskCard: async () => await Promise.resolve("the replayed task card"),
		readTaskOutput: async () =>
			await Promise.resolve(
				JSON.stringify({
					task: {
						acceptanceCriteria: ["done"],
						documentation: ["DOC-1 - replay-spec.md"],
					},
				}),
			),
		runWorkflowStage: async ({ targetDir, stage }) => {
			await Bun.write(
				join(targetDir, "backlog", "docs", "DOC-1 - replay-spec.md"),
				this.#artifactContent,
			);

			return {
				costUsd: 0.9,
				exchanges: [],
				providerCalls: [],
				sessionId: "session",
				stage,
			};
		},
	};
}
export default ReplayRepositoryStage;
