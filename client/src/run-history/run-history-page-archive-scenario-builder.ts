import type { Reply } from "#client/test-support/fetch-stub";

type SummaryCompletion = "valid" | "malformed";
type ArchiveAction = "archive" | "restore";
interface ArchiveScenario {
	readonly archived: readonly string[];
	readonly invalidMetadata: boolean;
	readonly legacy: boolean;
	readonly keepRun: boolean;
	readonly summary: SummaryCompletion | undefined;
	readonly archiveRefusal: Reply | undefined;
	readonly restoreRefusal: Reply | undefined;
	readonly pendingAction: ArchiveAction | undefined;
}

class ArchiveScenarioBuilder {
	public constructor(private readonly props: Partial<ArchiveScenario> = {}) {}

	public build(): ArchiveScenario {
		return {
			archiveRefusal: undefined,
			archived: [],
			invalidMetadata: false,
			keepRun: false,
			legacy: false,
			pendingAction: undefined,
			restoreRefusal: undefined,
			summary: undefined,
			...this.props,
		};
	}
}

export { ArchiveScenarioBuilder as default };
export type { ArchiveScenario, ArchiveAction, SummaryCompletion };
