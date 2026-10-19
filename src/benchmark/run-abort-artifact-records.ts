import type { RunArtifact } from "./contracts";
import type { RunArtifactPersistence } from "./run-abort-contracts";

const NO_SPEND_USD = 0;

const RECORD_JSON_INDENT_SPACES = 2;

const fileRunArtifactPersistence: RunArtifactPersistence = {
	write: async (path, contents) => {
		await Bun.write(path, contents);
	},
};

function totalSpentUsd(artifact: RunArtifact): number {
	return (
		artifact.workflow.reduce(
			(total, stage) => total + stage.costUsd,
			NO_SPEND_USD,
		) +
		artifact.stageScorecards.reduce(
			(total, stage) => total + stage.costUsd,
			NO_SPEND_USD,
		) +
		artifact.productOwnerCostUsd +
		artifact.judgeCostUsd
	);
}

async function writeRunArtifact(
	path: string,
	artifact: RunArtifact,
	persistence: RunArtifactPersistence = fileRunArtifactPersistence,
): Promise<void> {
	await persistence.write(
		path,
		`${JSON.stringify(artifact, null, RECORD_JSON_INDENT_SPACES)}\n`,
	);
}

export { fileRunArtifactPersistence, totalSpentUsd, writeRunArtifact };
