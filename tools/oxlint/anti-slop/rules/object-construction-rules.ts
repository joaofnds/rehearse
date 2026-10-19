import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";

const EMPTY_COLLECTION_LENGTH = 0;

function unwrapParentheses(
	node: Syntax<ESTree.Expression>,
): Syntax<ESTree.Expression> {
	let current = node;
	while (current.type === "ParenthesizedExpression") {
		current = current.expression;
	}
	return current;
}

function isEmptyObjectExpression(node: Syntax<ESTree.Expression>): boolean {
	return (
		node.type === "ObjectExpression" &&
		node.properties.length === EMPTY_COLLECTION_LENGTH
	);
}

function isConditionalEmptyObjectSpread(
	node: Syntax<ESTree.Expression>,
): boolean {
	const conditional = unwrapParentheses(node);
	return (
		conditional.type === "ConditionalExpression" &&
		(isEmptyObjectExpression(conditional.consequent) ||
			isEmptyObjectExpression(conditional.alternate))
	);
}

/** Ban conditional empty-object spreads without changing their omission semantics. */
const noConditionalEmptyObjectSpreadRule = defineRule({
	createOnce(context) {
		return {
			SpreadElement(node) {
				if (node.parent.type !== "ObjectExpression") {
					return;
				}

				if (isConditionalEmptyObjectSpread(node.argument)) {
					context.report({
						messageId: "avoid",
						node: { range: [node.start, node.end] },
					});
				}
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow object spreads that conditionally spread an empty object to omit fields.",
		},
		messages: {
			avoid:
				"This conditional spread hides property omission behind an empty object. Build the object in separate statements and add the property only when present.",
		},
		type: "suggestion",
	},
});

export { noConditionalEmptyObjectSpreadRule };
export { default as noNumericObjectProjectionRule } from "./numeric-object-projection.ts";
