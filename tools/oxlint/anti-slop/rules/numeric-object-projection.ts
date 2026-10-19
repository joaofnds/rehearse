import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import type { RuleSource } from "./bindings.ts";
import { unwrapExpression } from "./known-value-expressions.ts";
import projectionRecords from "./numeric-projection-bindings.ts";
import {
	projectsScalars,
	unpacksScalars,
} from "./numeric-projection-syntax.ts";
import isNumericScalarWrapper, {
	isNumericScalarUnpacking,
} from "./numeric-scalar-bindings.ts";
import type { Syntax } from "./syntax.ts";

function isNumericObjectProjection(
	source: RuleSource,
	node: Syntax<ESTree.CallExpression>,
): boolean {
	const callee = unwrapExpression(node.callee);
	if (callee.type !== "MemberExpression") {
		return false;
	}

	const records = projectionRecords(source, callee.object);

	return records !== null && projectsScalars(node, records);
}

function isNumericObjectUnpacking(
	source: RuleSource,
	node: Syntax<ESTree.VariableDeclarator>,
): boolean {
	if (node.id.type !== "ArrayPattern" || node.init === null) {
		return false;
	}

	const records = projectionRecords(source, node.init);

	return records !== null && unpacksScalars(node.id, records);
}

const noNumericObjectProjectionRule = defineRule({
	createOnce(context) {
		return {
			CallExpression(node) {
				if (isNumericObjectProjection(context.sourceCode, node)) {
					context.report({
						messageId: "avoid",
						node: { range: [node.start, node.end] },
					});
				}
			},
			MemberExpression(node) {
				if (isNumericScalarWrapper(context.sourceCode, node)) {
					context.report({
						messageId: "avoidScalar",
						node: { range: [node.start, node.end] },
					});
				}
			},
			VariableDeclarator(node) {
				if (isNumericScalarUnpacking(context.sourceCode, node)) {
					context.report({
						messageId: "avoidScalar",
						node: { range: [node.start, node.end] },
					});
				}
				if (isNumericObjectUnpacking(context.sourceCode, node)) {
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
				"Disallow numeric literals wrapped in objects solely to project them back into scalars.",
		},
		messages: {
			avoid:
				"These objects only wrap numbers that are projected back out. Name the scalar quantities and construct their array directly.",
			avoidScalar:
				"This numeric object is used only to read scalar quantities. Declare the quantities as named scalar constants.",
		},
		type: "problem",
	},
});

export { noNumericObjectProjectionRule as default };
