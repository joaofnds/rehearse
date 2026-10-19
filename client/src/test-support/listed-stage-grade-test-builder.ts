import type { Immutable } from "#benchmark/contracts";
import type { ListedStageGrade } from "#server/run-history";

type AvailableGrade = Extract<
	ListedStageGrade["grade"],
	{ readonly state: "available" }
>;

class ListedStageGradeBuilder {
	public constructor(
		private readonly props: Immutable<Partial<ListedStageGrade>> = {},
	) {}

	public graded(
		props: Immutable<Partial<AvailableGrade>> = {},
	): ListedStageGradeBuilder {
		const verdict = props.verdict ?? "CONTINUE";

		return new ListedStageGradeBuilder({
			...this.props,
			grade: {
				letter: "B",
				reachesMinimum: verdict !== "STOP",
				state: "available",
				...props,
				verdict,
			},
			status: "graded",
		});
	}

	public build(): ListedStageGrade {
		return {
			grade: { reasons: ["the stage wrote no record"], state: "unavailable" },
			stage: "build",
			status: "no-record",
			...this.props,
		};
	}
}

export { ListedStageGradeBuilder as default };
