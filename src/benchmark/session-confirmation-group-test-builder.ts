import type { SessionConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";

const CONFIRMATION_SCHEMA_VERSION = 2;

const SHA256_HEX_CHARACTERS = 64;

const FIRST_REP_ORDINAL = 1;
const SECOND_REP_ORDINAL = 2;
const REP_ORDINALS = [FIRST_REP_ORDINAL, SECOND_REP_ORDINAL] as const;

class SessionConfirmationGroupBuilder {
	readonly #values: Immutable<Partial<SessionConfirmationGroupRecord>>;
	public constructor(
		values: Immutable<Partial<SessionConfirmationGroupRecord>> = {},
	) {
		this.#values = values;
	}
	public build(): Immutable<SessionConfirmationGroupRecord> {
		return {
			approval: { approved: true as const, method: "yes" as const },
			caseId: "smoke",
			declaredStages: ["checks"] as const,
			groupId: "session-group",
			inputs: {
				files: [
					{
						kind: "case" as const,
						path: "inputs/case.json",
						sha256: "a".repeat(SHA256_HEX_CHARACTERS),
					},
				],
				lineage: { kind: "SESSION" as const, lineage: "lineage-1" },
				model: "sonnet",
				sessionBudgetUsd: 0.2,
			},
			makespanMs: 100,
			mode: "session" as const,
			preflight: {
				missing: "preflight call metrics",
				status: "MISSING" as const,
			},
			projectedCost: {
				perRepMaximumUsd: 0.2,
				preflightMaximumUsd: 0.1,
				reps: 2,
				totalMaximumUsd: 0.5,
			},
			repRecords: REP_ORDINALS.map((ordinal) => ({
				ordinal,
				path: `reps/session-group-rep-${ordinal}/rep.json`,
				repId: `session-group-rep-${ordinal}`,
			})),
			reportFile: "report.json",
			reps: 2,
			schemaVersion: CONFIRMATION_SCHEMA_VERSION,
			...this.#values,
		};
	}
}
export { SessionConfirmationGroupBuilder as default };
