import { defineRule } from "@oxlint/plugins";
import type { ESTree, SourceCode } from "@oxlint/plugins";

import {
	assertedExpression,
	unwrapExpressionParentheses,
} from "./assertion-syntax.ts";
import type { LexicalScope } from "./bindings.ts";
import { resolveLexicalVariable } from "./bindings.ts";
import {
	functionBoundary,
	widenedBinding,
} from "./immutable-value-evidence.ts";
import type { Syntax } from "./syntax.ts";
import { assertionIsNarrower } from "./widening-type-evidence.ts";

type TypeAssertionExpression =
	| Syntax<ESTree.TSAsExpression>
	| Syntax<ESTree.TSTypeAssertion>;

const ASSERTION_COUNT_INCREMENT = 1;
const UNCHAINED_ASSERTION_COUNT = 1;

function isTypeAssertionExpression(
	node: Syntax<ESTree.Node>,
): node is TypeAssertionExpression {
	return node.type === "TSAsExpression" || node.type === "TSTypeAssertion";
}

function isConstAssertion(node: TypeAssertionExpression): boolean {
	const { typeAnnotation } = node;
	return (
		typeAnnotation.type === "TSTypeReference" &&
		typeAnnotation.typeName.type === "Identifier" &&
		typeAnnotation.typeName.name === "const"
	);
}

function isOutermostAssertionInChain(node: TypeAssertionExpression): boolean {
	let current: Syntax<ESTree.Expression> = node;
	let { parent } = node;

	while (
		parent.type === "ParenthesizedExpression" &&
		parent.expression === current
	) {
		current = parent;
		({ parent } = parent);
	}

	return !isTypeAssertionExpression(parent) || parent.expression !== current;
}

function isForbiddenAssertionChain(node: TypeAssertionExpression): boolean {
	let assertionCount = 0;
	let hasNonConstAssertion = false;
	let current: Syntax<ESTree.Expression> = node;

	while (isTypeAssertionExpression(current)) {
		assertionCount += ASSERTION_COUNT_INCREMENT;
		hasNonConstAssertion ||= !isConstAssertion(current);
		current = unwrapExpressionParentheses(current.expression);
	}

	return assertionCount > UNCHAINED_ASSERTION_COUNT && hasNonConstAssertion;
}

/** Disallow nested TypeScript type assertions, while permitting chains made only of const assertions. */
const noChainedTypeAssertionsRule = defineRule({
	createOnce(context) {
		const checkTypeAssertion = (node: TypeAssertionExpression): void => {
			if (
				!isOutermostAssertionInChain(node) ||
				!isForbiddenAssertionChain(node)
			) {
				return;
			}
			context.report({
				messageId: "chained",
				node: { range: [node.start, node.end] },
			});
		};

		return {
			TSAsExpression(node) {
				checkTypeAssertion(node);
			},
			TSTypeAssertion(node) {
				checkTypeAssertion(node);
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow chained TypeScript as and angle-bracket assertions, including parenthesized chains.",
		},
		messages: {
			chained:
				"This assertion chain discards type evidence. Keep the original precise type, or parse untrusted input at its boundary before narrowing it.",
		},
		type: "problem",
	},
});

const commentOwnerKinds = new Set([
	"ExpressionStatement",
	"PropertyDefinition",
	"ReturnStatement",
	"ThrowStatement",
	"VariableDeclaration",
]);

function hasSafetyComment(
	sourceCode: Readonly<Pick<SourceCode, "getCommentsBefore">>,
	node: TypeAssertionExpression,
): boolean {
	let current: Syntax<ESTree.Node> = node;
	while (true) {
		if (
			sourceCode
				.getCommentsBefore({
					end: current.end,
					loc: current.loc,
					range: [current.start, current.end],
					start: current.start,
				})
				.some(
					(comment) =>
						comment.end <= node.start && /\bSAFETY\s*:/u.test(comment.value),
				)
		) {
			return true;
		}
		if (current.parent.type === "Program") {
			return false;
		}
		// A comment directly before `export const x = ...` attaches to the
		// ExportNamedDeclaration, not the VariableDeclaration it wraps: keep
		// climbing through the export wrapper before stopping at an owner kind.
		if (
			commentOwnerKinds.has(current.type) &&
			current.parent.type !== "ExportNamedDeclaration" &&
			current.parent.type !== "ExportDefaultDeclaration"
		) {
			return false;
		}
		current = current.parent;
	}
}

/** Require every non-const type assertion to state the invariant TypeScript cannot express. */
const requireSafetyCommentForTypeAssertionRule = defineRule({
	createOnce(context) {
		const checkAssertion = (node: TypeAssertionExpression): void => {
			if (
				isConstAssertion(node) ||
				hasSafetyComment(context.sourceCode, node)
			) {
				return;
			}
			context.report({
				messageId: "missingSafetyComment",
				node: { range: [node.start, node.end] },
			});
		};

		return {
			TSAsExpression(node) {
				checkAssertion(node);
			},
			TSTypeAssertion(node) {
				checkAssertion(node);
			},
		};
	},
	meta: {
		docs: {
			description:
				"Require a nearby SAFETY comment for every TypeScript type assertion except const assertions.",
		},
		messages: {
			missingSafetyComment:
				"This type assertion has no `SAFETY:` justification. State the checked invariant immediately before the assertion or its containing statement.",
		},
		type: "problem",
	},
});

/** Detect immutable local bindings that erase a known type and are later asserted back to a narrower type. */
const noWidenThenAssertRule = defineRule({
	createOnce(context) {
		let scopes: readonly LexicalScope[] = [];

		const checkAssertion = (
			node: Syntax<ESTree.TSAsExpression> | Syntax<ESTree.TSTypeAssertion>,
		): void => {
			const expression = assertedExpression(node);
			if (expression.type !== "Identifier") {
				return;
			}

			const variable = resolveLexicalVariable(scopes, expression);
			if (variable === null) {
				return;
			}
			const widened = widenedBinding(variable, scopes);
			if (
				widened === null ||
				node.start <= widened.declaredAt ||
				functionBoundary(node) !== widened.boundary ||
				!assertionIsNarrower(
					{ broadKind: widened.broadKind, sourceText: context.sourceCode.text },
					widened.evidence,
					node.typeAnnotation,
				)
			) {
				return;
			}

			context.report({
				data: { name: expression.name },
				messageId: "widenThenAssert",
				node: { range: [node.start, node.end] },
			});
		};

		return {
			Program() {
				({ scopes } = context.sourceCode.scopeManager);
			},
			TSAsExpression(node) {
				checkAssertion(node);
			},
			TSTypeAssertion(node) {
				checkAssertion(node);
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow local const flows that explicitly widen a known value before asserting the widened binding to a narrower type.",
		},
		messages: {
			widenThenAssert:
				'Binding "{{name}}" discards type evidence and later recreates it with an assertion. Keep the precise type from initialization through use; parse boundary input once.',
		},
		type: "problem",
	},
});

export {
	noChainedTypeAssertionsRule,
	noWidenThenAssertRule,
	requireSafetyCommentForTypeAssertionRule,
};
