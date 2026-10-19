import type { ESTree } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";

function unwrapExpressionParentheses(
	expression: Syntax<ESTree.Expression>,
): Syntax<ESTree.Expression> {
	let current = expression;
	while (current.type === "ParenthesizedExpression") {
		current = current.expression;
	}
	return current;
}

function unwrapTypeParentheses(
	type: Syntax<ESTree.TSType>,
): Syntax<ESTree.TSType> {
	let current = type;
	while (current.type === "TSParenthesizedType") {
		current = current.typeAnnotation;
	}
	return current;
}

function typeReferenceName(
	type: Syntax<ESTree.TSTypeReference>,
): string | null {
	return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function assertedExpression(
	node: Syntax<ESTree.TSAsExpression> | Syntax<ESTree.TSTypeAssertion>,
): Syntax<ESTree.Expression> {
	return unwrapExpressionParentheses(node.expression);
}

function assertionFromExpression(
	expression: Syntax<ESTree.Expression>,
): Syntax<ESTree.TSAsExpression> | Syntax<ESTree.TSTypeAssertion> | null {
	const unwrapped = unwrapExpressionParentheses(expression);
	return unwrapped.type === "TSAsExpression" ||
		unwrapped.type === "TSTypeAssertion"
		? unwrapped
		: null;
}

function normalizedTypeText(
	sourceText: string,
	type: Syntax<ESTree.TSType>,
): string {
	return sourceText.slice(type.start, type.end).replaceAll(/\s+/gu, "");
}

function typesHaveSameSyntax(
	sourceText: string,
	left: Syntax<ESTree.TSType> | null,
	right: Syntax<ESTree.TSType>,
): boolean {
	return (
		left !== null &&
		normalizedTypeText(sourceText, unwrapTypeParentheses(left)) ===
			normalizedTypeText(sourceText, unwrapTypeParentheses(right))
	);
}

export {
	assertedExpression,
	assertionFromExpression,
	typeReferenceName,
	typesHaveSameSyntax,
	unwrapExpressionParentheses,
	unwrapTypeParentheses,
};
