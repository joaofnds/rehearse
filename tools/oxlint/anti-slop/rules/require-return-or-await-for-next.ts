import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";

const FINAL_SEQUENCE_EXPRESSION_OFFSET = -1;
const FINAL_STATEMENT_OFFSET = -1;
const PENULTIMATE_STATEMENT_OFFSET = -2;

function isFunction(node: Syntax<ESTree.Node> | null): boolean {
	return (
		node?.type === "FunctionDeclaration" ||
		node?.type === "FunctionExpression" ||
		node?.type === "ArrowFunctionExpression"
	);
}

function isCallStatement(
	statement: Syntax<ESTree.Statement> | undefined,
	call: Syntax<ESTree.CallExpression>,
): boolean {
	if (statement?.type !== "ExpressionStatement") {
		return false;
	}
	const { expression } = statement;
	const completed =
		expression.type === "BinaryExpression" ||
		expression.type === "LogicalExpression"
			? expression.right
			: expression;
	return completed.start === call.start && completed.end === call.end;
}

function hasFunctionParent(call: Syntax<ESTree.CallExpression>): boolean {
	let parent: Syntax<ESTree.Node> | null = call.parent;
	while (parent !== null) {
		if (isFunction(parent)) {
			return true;
		}
		({ parent } = parent);
	}
	return false;
}

function forwardsValue(
	parent: Syntax<ESTree.Node>,
	value: Syntax<ESTree.Node>,
): boolean {
	if (parent.type === "ConditionalExpression") {
		return parent.consequent === value || parent.alternate === value;
	}
	if (parent.type === "LogicalExpression") {
		return parent.right === value;
	}
	if (parent.type === "SequenceExpression") {
		return parent.expressions.at(FINAL_SEQUENCE_EXPRESSION_OFFSET) === value;
	}
	if (
		parent.type === "ChainExpression" ||
		parent.type === "ParenthesizedExpression" ||
		parent.type === "TSAsExpression" ||
		parent.type === "TSInstantiationExpression" ||
		parent.type === "TSNonNullExpression" ||
		parent.type === "TSSatisfiesExpression" ||
		parent.type === "TSTypeAssertion"
	) {
		return parent.expression === value;
	}
	return false;
}

function isAwaited(call: Syntax<ESTree.CallExpression>): boolean {
	let value: Syntax<ESTree.Node> = call;
	let parent: Syntax<ESTree.Node> | null = value.parent;
	while (parent !== null) {
		if (parent.type === "AwaitExpression") {
			return true;
		}
		if (!forwardsValue(parent, value)) {
			return false;
		}
		value = parent;
		({ parent } = value);
	}
	return false;
}

function completesBlock(
	block: Syntax<ESTree.BlockStatement>,
	call: Syntax<ESTree.CallExpression>,
): boolean {
	const last = block.body.at(FINAL_STATEMENT_OFFSET);
	return (
		(isFunction(block.parent) && isCallStatement(last, call)) ||
		(last?.type === "ReturnStatement" &&
			isCallStatement(block.body.at(PENULTIMATE_STATEMENT_OFFSET), call))
	);
}

/** Match completion placement while allowing promise continuations to be awaited. */
function observesContinuation(call: Syntax<ESTree.CallExpression>): boolean {
	if (isAwaited(call) || !hasFunctionParent(call)) {
		return true;
	}
	let parent: Syntax<ESTree.Node> | null = call.parent;
	while (parent !== null) {
		if (
			parent.type === "ReturnStatement" ||
			parent.type === "ArrowFunctionExpression"
		) {
			return true;
		}
		if (parent.type === "BlockStatement") {
			return completesBlock(parent, call);
		}
		({ parent } = parent);
	}
	return true;
}

/** Retain completion checks for next while supporting Hono's Promise<void> Next. */
const requireReturnOrAwaitForNextRule = defineRule({
	createOnce(context) {
		return {
			CallExpression(node) {
				if (
					node.callee.type === "Identifier" &&
					node.callee.name === "next" &&
					!observesContinuation(node)
				) {
					context.report({
						messageId: "unobservedNext",
						node: { range: [node.start, node.end] },
					});
				}
			},
		};
	},
	meta: {
		docs: {
			description:
				"Return after synchronous next callbacks and await promise continuations.",
		},
		messages: {
			unobservedNext:
				"Return after completing a synchronous next callback, or await a promise continuation.",
		},
		type: "problem",
	},
});

export { requireReturnOrAwaitForNextRule as default };
