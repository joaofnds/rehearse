import type { Immutable } from "#benchmark/contracts";
import type { Assessment, RegradedCheck } from "#benchmark/session-regrade";

import { sha256Of } from "./session-regrade-evidence-test-fixture";

class RegradeAssessmentBuilder {
	readonly #check: Immutable<Omit<RegradedCheck, "kind">>;
	public constructor(check: Partial<Omit<RegradedCheck, "kind">> = {}) {
		this.#check = {
			detail: check.detail ?? "3 words",
			status: check.status ?? "PASS",
		};
	}
	public build(): Assessment {
		const check = this.#check;
		return {
			checks: [{ kind: "word-band", ...check }],
			evidence: { reply: sha256Of("the reply") },
			gradingDefinition: sha256Of("a definition"),
			outcome: check.status === "PASS" ? "SUCCESSFUL" : "UNSUCCESSFUL",
			sourceAttempt: { caseId: "smoke", uuid: "uuid-1" },
		};
	}
}
export default RegradeAssessmentBuilder;
