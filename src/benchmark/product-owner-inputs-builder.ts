import { tmpdir } from "node:os";
import { join } from "node:path";

import { ampleSpendCeiling } from "./test-support";
import type { ProductOwnerConfiguration } from "./workflow";

class ProductOwnerInputsBuilder {
	readonly #overrides: Partial<ProductOwnerConfiguration>;
	public constructor(overrides: Partial<ProductOwnerConfiguration> = {}) {
		this.#overrides = overrides;
	}
	public build(): ProductOwnerConfiguration {
		return {
			directory: join(tmpdir(), "rehearse-halted-product-owner"),
			model: "sonnet",
			productBrief: "Operators audit changes",
			sessionBudgetUsd: 5,
			spendCeiling: ampleSpendCeiling(),
			task: "Add an audit log",
			...this.#overrides,
		};
	}
}
export default ProductOwnerInputsBuilder;
