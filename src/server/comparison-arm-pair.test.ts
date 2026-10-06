import { describe, expect, it } from "bun:test";
import { armPairNames, armPairs, pairKey } from "./comparison-arm-pair";

describe(pairKey.name, () => {
	it("builds a PascalCase-subtrahend key from two arm names", () => {
		expect(pairKey("candidate", "baseline")).toBe("candidateMinusBaseline");
	});
});

describe(armPairNames.name, () => {
	it("decodes only canonical arm pairs", () => {
		expect(armPairNames("candidateMinusBaseline")).toEqual({
			minuend: "candidate",
			subtrahend: "baseline",
		});
		expect(() => armPairNames("candidateMinusUnknown")).toThrow(
			"Unknown comparison arm pair: candidateMinusUnknown",
		);
	});
});

describe(armPairs.name, () => {
	it("returns the report's three canonical contrasts, not every ordered pair", () => {
		expect(armPairs()).toEqual([
			{ minuend: "candidate", subtrahend: "baseline" },
			{ minuend: "candidate", subtrahend: "control" },
			{ minuend: "baseline", subtrahend: "control" },
		]);
	});
});
