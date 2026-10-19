import { recordFileFor } from "#cli/show-command";
import type {
	AttemptEvidenceIdentity,
	AttemptEvidenceInput,
} from "#server/attempt-evidence-contract";
import readConstructedEvidenceFile from "#server/constructed-evidence-file";
import { canonicalRunsRoot } from "#server/session-history-reader";

async function savedAttemptFile(
	runsDirectory: string,
	id: AttemptEvidenceIdentity,
): Promise<AttemptEvidenceInput> {
	const root = await canonicalRunsRoot(runsDirectory);
	const file = await recordFileFor(id, root);
	const saved = await readConstructedEvidenceFile(root, file);

	return { id, root, saved };
}

export { savedAttemptFile as default };
