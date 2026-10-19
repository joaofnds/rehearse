import RecordedReplayRunBuilder from "./replay-confirmation-run-test-builder";
import type {
	RecordedReplayRunOptions,
	RecordedRun,
} from "./replay-confirmation-run-test-builder";
import ReplayConfirmationHarness from "./replay-confirmation-test-support";
import type { TestResources } from "./test-support";

interface ReplayConfirmationFixture {
	readonly harness: ReplayConfirmationHarness;
	readonly run: RecordedRun;
}
class ReplayConfirmationFixtureBuilder {
	readonly #overrides: Partial<RecordedReplayRunOptions>;
	public constructor(overrides: Partial<RecordedReplayRunOptions> = {}) {
		this.#overrides = overrides;
	}
	public async build(
		resources: Pick<TestResources, "track">,
	): Promise<ReplayConfirmationFixture> {
		const harness = new ReplayConfirmationHarness();
		const run = await new RecordedReplayRunBuilder(this.#overrides).build(
			resources,
		);

		return { harness, run };
	}
}
export default ReplayConfirmationFixtureBuilder;
