import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";
import { z } from "zod";

import isGlobalReflectMethodCall from "./reflect-method.ts";
import type { Syntax } from "./syntax.ts";

/** Ban Reflect.apply, which bypasses ordinary typed function calls. */
const noReflectApplyRule = defineRule({
	createOnce(context) {
		return {
			CallExpression(node) {
				if (
					node.callee.type === "Super" ||
					node.callee.type === "V8IntrinsicExpression"
				) {
					return;
				}
				if (
					isGlobalReflectMethodCall(context.sourceCode, node.callee, "apply")
				) {
					context.report({
						messageId: "reflectApply",
						node: { range: [node.start, node.end] },
					});
				}
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow Reflect.apply; call typed functions directly or model dynamic dispatch behind an interface.",
		},
		messages: {
			reflectApply:
				"Replace `Reflect.apply` with a typed function call. Model dynamic dispatch behind a named interface.",
		},
		type: "problem",
	},
});

/** Ban Reflect.get, which bypasses ordinary property access and useful type evidence. */
const noReflectGetRule = defineRule({
	createOnce(context) {
		return {
			CallExpression(node) {
				if (
					node.callee.type === "Super" ||
					node.callee.type === "V8IntrinsicExpression"
				) {
					return;
				}
				if (isGlobalReflectMethodCall(context.sourceCode, node.callee, "get")) {
					context.report({
						messageId: "reflectGet",
						node: { range: [node.start, node.end] },
					});
				}
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow Reflect.get; use typed property access or parse dynamic input into a domain type.",
		},
		messages: {
			reflectGet:
				"Replace `Reflect.get` with typed property access. Parse dynamic input into a named domain type before reading it.",
		},
		type: "problem",
	},
});

type RuntimeFunction =
	| Syntax<ESTree.ArrowFunctionExpression>
	| Syntax<ESTree.Function>;

const typeGuardOptions = z.looseObject({ allowInTypeGuards: z.literal(true) });

function isRuntimeFunction(node: Syntax<ESTree.Node>): node is RuntimeFunction {
	return (
		node.type === "ArrowFunctionExpression" ||
		node.type === "FunctionDeclaration" ||
		node.type === "FunctionExpression"
	);
}

function isInsideTypeGuard(node: Syntax<ESTree.Node>): boolean {
	let current: Syntax<ESTree.Node> | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (isRuntimeFunction(current)) {
			return current.returnType?.typeAnnotation.type === "TSTypePredicate";
		}
		current = current.parent;
	}
	return false;
}

/** Disallow runtime typeof checks that narrow unparsed values instead of decoding them. */
const noRuntimeTypeofRule = defineRule({
	createOnce(context) {
		return {
			UnaryExpression(node) {
				const [option] = context.options ?? [];
				const allowInTypeGuards = typeGuardOptions.safeParse(option).success;
				if (
					node.operator === "typeof" &&
					(!allowInTypeGuards || !isInsideTypeGuard(node))
				) {
					context.report({
						messageId: "runtimeTypeof",
						node: { range: [node.start, node.end] },
					});
				}
			},
		};
	},
	meta: {
		defaultOptions: [{ allowInTypeGuards: false }],
		docs: {
			description:
				"Disallow runtime typeof checks; external values must be decoded into meaningful types at their I/O boundary.",
		},
		messages: {
			runtimeTypeof:
				"A `typeof` check narrows a representation without establishing its contract. Parse input at its I/O boundary, then branch on the domain value.",
		},
		schema: [
			{
				additionalProperties: false,
				properties: {
					allowInTypeGuards: { type: "boolean" },
				},
				type: "object",
			},
		],
		type: "problem",
	},
});

export { noReflectApplyRule, noReflectGetRule, noRuntimeTypeofRule };
