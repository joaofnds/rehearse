import { describe, expect, it } from "bun:test";
import { render } from "@testing-library/react";
import { RoleMark } from "./analysis-role";

describe("RoleMark", () => {
	it.each([
		["root cause", "✕ root cause"],
		["contributing factor", "~ contributing factor"],
		["not a factor", "· not a factor"],
		["never ran", "○ never ran"],
	] as const)("shows the %s role as its glyph and words", (role, shown) => {
		const { container } = render(<RoleMark role={role} words="shown" />);

		expect(container.textContent).toBe(shown);
	});
});
