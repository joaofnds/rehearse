import type { ConfirmationReliabilityRep } from "./confirmation-report";
import type { Immutable } from "./contracts";

class ConfirmationReliabilityRepBuilder {
	readonly #values: Immutable<Partial<ConfirmationReliabilityRep>>;
	public constructor(
		values: Immutable<Partial<ConfirmationReliabilityRep>> = {},
	) {
		this.#values = values;
	}
	public build(): Immutable<ConfirmationReliabilityRep> {
		return {
			finalOutcome: { status: "JUDGED", verdict: "PASS" },
			metricsComplete: true,
			stages: [
				{
					grade: "A",
					stage: "shape",
					status: "JUDGED",
					verdict: "CONTINUE",
				},
				{
					grade: "B",
					stage: "build",
					status: "JUDGED",
					verdict: "CONTINUE",
				},
			],
			...this.#values,
		};
	}
	public judgedFailureRep(): ConfirmationReliabilityRepBuilder {
		return new ConfirmationReliabilityRepBuilder({
			...this.#values,
			finalOutcome: { status: "JUDGED", verdict: "FAIL" },
			metricsComplete: true,
			stages: [
				{
					grade: "B",
					stage: "shape",
					status: "JUDGED",
					verdict: "CONTINUE",
				},
				{
					grade: "C",
					stage: "build",
					status: "JUDGED",
					verdict: "STOP",
				},
			],
		});
	}
	public stoppedPlanningRep(): ConfirmationReliabilityRepBuilder {
		return new ConfirmationReliabilityRepBuilder({
			...this.#values,
			finalOutcome: { status: "NOT_REACHED" },
			metricsComplete: true,
			stages: [
				{
					grade: "D",
					stage: "shape",
					status: "JUDGED",
					verdict: "STOP",
				},
				{ stage: "build", status: "NOT_REACHED" },
			],
		});
	}
	public failedPlanningRep(): ConfirmationReliabilityRepBuilder {
		return new ConfirmationReliabilityRepBuilder({
			...this.#values,
			finalOutcome: { status: "NOT_REACHED" },
			metricsComplete: true,
			stages: [
				{ stage: "shape", status: "EXECUTION_FAILED" },
				{ stage: "build", status: "NOT_REACHED" },
			],
		});
	}
	public unmeasuredPlanningRep(): ConfirmationReliabilityRepBuilder {
		return new ConfirmationReliabilityRepBuilder({
			...this.#values,
			finalOutcome: { status: "NOT_REACHED" },
			metricsComplete: true,
			stages: [
				{ stage: "shape", status: "METRICS_MISSING" },
				{ stage: "build", status: "NOT_REACHED" },
			],
		});
	}
}
export { ConfirmationReliabilityRepBuilder as default };
