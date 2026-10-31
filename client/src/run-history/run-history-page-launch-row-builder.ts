import type { RunHistoryResponse } from "./run-history-query";

type LaunchRow = RunHistoryResponse["launches"][number];

type ProcessLaunchRow = Exclude<LaunchRow, { status: "ENDED" }>;

type EndedLaunchRow = Extract<LaunchRow, { status: "ENDED" }>;

class LaunchRowBuilder {
	public constructor(private readonly props: Partial<ProcessLaunchRow> = {}) {}

	public build(): ProcessLaunchRow {
		const id = this.props.id ?? "7b0c2d4e-0000-4000-8000-000000000000";
		return {
			attempts: 1,
			caseId: "audit-log",
			id,
			kind: "launch",
			launchedAt: "2026-09-29T10:00:00.000Z",
			run: undefined,
			stage: undefined,
			status: "RUNNING",
			target: "case",
			...this.props,
		};
	}

	public buildEnded(message: string): EndedLaunchRow {
		return {
			...this.build(),
			ending: { exitCode: 1, message },
			status: "ENDED",
		};
	}
}

export { LaunchRowBuilder as default };
