import type {
	RecordedRunsContext,
	RecordedRunsFixtureProps,
} from "./recorded-runs-fixture-context";
import { openRunEventStore } from "./run-events";
import type { NewRunEvent } from "./run-events";
import { runEventsDatabaseFile } from "./run-layout";

class RecordedEventLog {
	private readonly context: RecordedRunsContext;
	public constructor(props: RecordedRunsFixtureProps) {
		this.context = props.context;
	}
	public readonly append = async (
		events: readonly NewRunEvent[],
	): Promise<void> => {
		const store = await openRunEventStore(
			runEventsDatabaseFile(this.context.runsDirectory),
		);

		try {
			for (const event of events) {
				store.append(event);
			}
		} finally {
			store.close();
		}
	};
}
export { RecordedEventLog as default };
