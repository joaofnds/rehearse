import ConfirmationGroupWriters from "./recorded-runs-fixture-confirmation-group-writers";
import ConfirmationRepEvidence from "./recorded-runs-fixture-confirmation-rep-evidence";
import type { RecordedRunsFixtureProps } from "./recorded-runs-fixture-context";
import FrozenGroupEvidence from "./recorded-runs-fixture-frozen-group-evidence";

class ConfirmationGroupRecords {
	public readonly records: ConfirmationGroupWriters;
	public readonly corpus: FrozenGroupEvidence;
	public readonly reads: ConfirmationRepEvidence;
	public constructor(props: RecordedRunsFixtureProps) {
		this.records = new ConfirmationGroupWriters(props);
		this.corpus = new FrozenGroupEvidence({
			context: props.context,
			writers: this.records,
		});
		this.reads = new ConfirmationRepEvidence(props);
	}
}
export { ConfirmationGroupRecords as default };
