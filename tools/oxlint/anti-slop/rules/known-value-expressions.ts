import type { ESTree } from "@oxlint/plugins";

import { resolveVariable } from "./bindings.ts";
import type { RuleSource } from "./bindings.ts";
import type { Binding, Syntax } from "./syntax.ts";

const EMPTY_OBJECT_PROPERTY_COUNT = 0;

const SINGLE_BINDING_DEFINITION_COUNT = 1;

function isPopulatedObjectExpression(
	expression: Syntax<ESTree.Expression>,
): boolean {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression"
	) {
		current = current.expression;
	}
	return (
		current.type === "ObjectExpression" &&
		current.properties.length > EMPTY_OBJECT_PROPERTY_COUNT
	);
}

function isKnownEvidenceExpression(
	expression: Syntax<ESTree.Expression>,
): boolean {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression" ||
		current.type === "TSSatisfiesExpression"
	) {
		current = current.expression;
	}
	if (current.type === "ObjectExpression") {
		return true;
	}
	return (
		current.type === "ArrayExpression" ||
		current.type === "ArrowFunctionExpression" ||
		current.type === "ClassExpression" ||
		current.type === "FunctionExpression" ||
		current.type === "NewExpression" ||
		current.type === "Literal" ||
		current.type === "TemplateLiteral" ||
		current.type === "UnaryExpression"
	);
}

function unwrapExpression(
	expression: Syntax<ESTree.Expression>,
): Syntax<ESTree.Expression> {
	let current = expression;
	while (
		current.type === "ParenthesizedExpression" ||
		current.type === "TSAsExpression" ||
		current.type === "TSSatisfiesExpression" ||
		current.type === "TSTypeAssertion" ||
		current.type === "TSNonNullExpression"
	) {
		current = current.expression;
	}
	return current;
}

function variableDeclarator(
	variable: Binding,
): Syntax<ESTree.VariableDeclarator> | null {
	if (variable.defs.length !== SINGLE_BINDING_DEFINITION_COUNT) {
		return null;
	}
	const [definition] = variable.defs;
	return definition?.type === "Variable" &&
		definition.node.type === "VariableDeclarator"
		? definition.node
		: null;
}

function isStableConstBinding(
	variable: Binding,
	declarator: Syntax<ESTree.VariableDeclarator>,
): boolean {
	return (
		declarator.parent.type === "VariableDeclaration" &&
		declarator.parent.kind === "const" &&
		variable.references.every(
			(reference) => reference.init || !reference.isWrite(),
		)
	);
}

function hasKnownEvidence(
	sourceCode: RuleSource,
	expression: Syntax<ESTree.Expression>,
	visitedBindings: ReadonlySet<Binding> = new Set(),
): boolean {
	if (isKnownEvidenceExpression(expression)) {
		return true;
	}
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type !== "Identifier") {
		return false;
	}
	const variable = resolveVariable(sourceCode, unwrapped);
	if (variable === null || visitedBindings.has(variable)) {
		return false;
	}
	return constantBindingHasEvidence(sourceCode, variable, visitedBindings);
}

function constantBindingHasEvidence(
	sourceCode: RuleSource,
	variable: Binding,
	visitedBindings: ReadonlySet<Binding>,
): boolean {
	const declarator = variableDeclarator(variable);
	if (declarator === null) {
		return false;
	}
	if (declarator.init === null || !isStableConstBinding(variable, declarator)) {
		return false;
	}
	return hasKnownEvidence(
		sourceCode,
		declarator.init,
		new Set([...visitedBindings, variable]),
	);
}

export {
	hasKnownEvidence,
	isKnownEvidenceExpression,
	isPopulatedObjectExpression,
	unwrapExpression,
	variableDeclarator,
};
