import type { Immutable } from "#benchmark/contracts";
import type { ReviewRequest } from "#cli/review-command";

class ReviewRequestBuilder {
	public constructor(
		private readonly overrides: Immutable<Partial<ReviewRequest>> = {},
	) {}
	public build(): ReviewRequest {
		return {
			file: undefined,
			findings: [],
			id: "2026-09-03T00-00-00.000Z",
			json: false,
			runsDirectory: "/runs",
			summary: undefined,
			verdict: undefined,
			...this.overrides,
		};
	}
}
export { ReviewRequestBuilder as default };
