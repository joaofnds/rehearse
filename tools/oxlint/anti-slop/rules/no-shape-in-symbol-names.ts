import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";

const FORBIDDEN_SYMBOL_NAME = "shape";

function containsForbiddenSymbolName(name: string): boolean {
	return name.toLowerCase().includes(FORBIDDEN_SYMBOL_NAME);
}

/** Ban the case-insensitive substring "shape" in every JavaScript and TypeScript symbol name. */
const noForbiddenTermInSymbolNamesRule = defineRule({
	createOnce(context) {
		const reportForbiddenSymbolName = (
			node: Syntax<ESTree.Node> & { readonly name: string },
		): void => {
			if (!containsForbiddenSymbolName(node.name)) {
				return;
			}
			context.report({
				data: { name: node.name },
				messageId: "forbiddenSymbolName",
				node: { range: [node.start, node.end] },
			});
		};

		return {
			Identifier(node) {
				reportForbiddenSymbolName(node);
			},
			JSXIdentifier(node) {
				reportForbiddenSymbolName(node);
			},
			PrivateIdentifier(node) {
				reportForbiddenSymbolName(node);
			},
		};
	},
	meta: {
		docs: {
			description:
				'Disallow the case-insensitive substring "shape" in JavaScript, TypeScript, private, and JSX symbol names.',
		},
		messages: {
			forbiddenSymbolName:
				'Rename symbol "{{name}}" for its domain role; "shape" describes structure rather than ownership.',
		},
		type: "problem",
	},
});

export { noForbiddenTermInSymbolNamesRule as default };
