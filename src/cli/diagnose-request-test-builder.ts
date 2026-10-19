import type { Immutable } from "#benchmark/contracts";
import { RUN } from "#benchmark/root-cause-analysis-test-support";
import type { DiagnoseRequest } from "#cli/diagnose-command";

class DiagnoseRequestBuilder {
	public constructor(
		private readonly overrides: Immutable<Partial<DiagnoseRequest>> = {},
	) {}
	public build(): DiagnoseRequest {
		return {
			budgetUsd: undefined,
			id: RUN,
			json: false,
			model: "sonnet",
			runsDirectory: "/runs",
			...this.overrides,
		};
	}
}
export { DiagnoseRequestBuilder as default };
