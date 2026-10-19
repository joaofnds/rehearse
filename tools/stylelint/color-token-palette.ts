import { fileURLToPath } from "node:url";

import stylelint from "stylelint";
import type { Rule, RuleBase } from "stylelint";

const ruleName = "rehearse/color-token-palette";

const paletteFile = fileURLToPath(
	new URL("../../client/src/system/tokens.css", import.meta.url),
);
const messages = stylelint.utils.ruleMessages(ruleName, {
	rejected:
		"Hex colors belong in :root --color-* declarations in client/src/system/tokens.css",
});

const paletteRule: RuleBase<boolean> = (primary) => async (root, result) => {
	if (
		!stylelint.utils.validateOptions(result, ruleName, {
			actual: primary,
			possible: [true],
		})
	) {
		return;
	}

	const paletteDeclarations = root.nodes.flatMap((node) =>
		node.type === "rule" && node.selector === ":root"
			? node.nodes.filter(
					(declaration) =>
						declaration.type === "decl" &&
						declaration.prop.startsWith("--color-") &&
						declaration.source?.input.file === paletteFile,
				)
			: [],
	);

	await stylelint.utils.checkAgainstRule(
		{ result, root, ruleName: "color-no-hex", ruleSettings: true },
		(warning) => {
			if (paletteDeclarations.some((node) => node === warning.node)) {
				return;
			}

			stylelint.utils.report({
				end: {
					column: warning.endColumn ?? warning.column,
					line: warning.endLine ?? warning.line,
				},
				message: messages.rejected,
				node: warning.node,
				result,
				ruleName,
				start: { column: warning.column, line: warning.line },
			});
		},
	);
};

const rule: Rule<boolean> = Object.assign(paletteRule, {
	messages,
	ruleName,
});

export { ruleName, rule };
