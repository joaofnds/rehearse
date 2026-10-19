import type { RunLiveness } from "#benchmark/run-liveness";
import { nothingRunning } from "#benchmark/run-records-test-support";
import { storeSpendCeiling } from "#benchmark/settings";
import type {
	CorpusEditDriver,
	EditRequest,
} from "#server/corpus-edit-test-driver";
import { serving } from "#server/corpus-edit-workspace-test-fixture";
import type { Served } from "#server/corpus-edit-workspace-test-fixture";

interface ReviewedEdit {
	readonly served: Served;
	readonly edit: EditRequest;
	readonly review: Awaited<ReturnType<CorpusEditDriver["review"]>>;
}

async function reviewedEdit(
	liveness: RunLiveness = nothingRunning,
	ceilingUsd?: number,
): Promise<ReviewedEdit> {
	const served = await serving(liveness);
	const edit = { path: "CLAUDE.md", text: "instructions, edited\n" };
	const review = await served.driver.review(edit);
	if (ceilingUsd !== undefined) {
		await storeSpendCeiling(served.runsDirectory, ceilingUsd);
	}

	return { edit, review, served };
}

export { reviewedEdit as default };
