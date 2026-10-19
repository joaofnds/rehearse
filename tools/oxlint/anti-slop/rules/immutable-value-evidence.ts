import type { ESTree } from "@oxlint/plugins";

import {
	assertedExpression,
	assertionFromExpression,
	unwrapExpressionParentheses,
} from "./assertion-syntax.ts";
import type { LexicalScope } from "./bindings.ts";
import { resolveLexicalVariable } from "./bindings.ts";
import type { Binding, Syntax } from "./syntax.ts";
import { broadTypeKind } from "./widening-type-evidence.ts";
import type {
	BroadTypeKind,
	KnownValueEvidence,
} from "./widening-type-evidence.ts";

const functionBoundaryTypes = new Set([
	"ArrowFunctionExpression",
	"FunctionDeclaration",
	"FunctionExpression",
	"TSDeclareFunction",
	"TSEmptyBodyFunctionExpression",
]);

function functionBoundary(
	node: Syntax<ESTree.Node>,
): Syntax<ESTree.Node> | null {
	let current = node.parent;
	while (current !== null && current.type !== "Program") {
		if (functionBoundaryTypes.has(current.type)) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

function variableDeclarator(
	variable: Binding,
): Syntax<ESTree.VariableDeclarator> | null {
	for (const definition of variable.defs) {
		if (
			definition.type === "Variable" &&
			definition.node.type === "VariableDeclarator"
		) {
			return definition.node;
		}
	}
	return null;
}

const knownExpressionKinds: ReadonlySet<string> = new Set([
	"Literal",
	"TemplateLiteral",
	"ArrayExpression",
	"ArrowFunctionExpression",
	"ClassExpression",
	"FunctionExpression",
	"NewExpression",
	"ObjectExpression",
]);

interface ValueEvidenceResolution {
	readonly scopes: readonly LexicalScope[];
	readonly boundary: Syntax<ESTree.Node> | null;
	readonly visitedBindings: ReadonlySet<Binding>;
}

function knownValueEvidence(
	expression: Syntax<ESTree.Expression>,
	resolution: ValueEvidenceResolution,
): KnownValueEvidence | null {
	const unwrapped = unwrapExpressionParentheses(expression);
	if (
		unwrapped.type === "TSAsExpression" ||
		unwrapped.type === "TSTypeAssertion"
	) {
		return broadTypeKind(unwrapped.typeAnnotation) === null
			? { type: unwrapped.typeAnnotation }
			: null;
	}
	if (knownExpressionKinds.has(unwrapped.type)) {
		return { type: null };
	}
	return unwrapped.type === "Identifier"
		? identifierValueEvidence(unwrapped, resolution)
		: null;
}

function annotatedValueEvidence(
	identifier: Syntax<ESTree.Node>,
	annotation: Syntax<ESTree.TSType>,
	boundary: Syntax<ESTree.Node> | null,
): KnownValueEvidence | null {
	return functionBoundary(identifier) === boundary &&
		broadTypeKind(annotation) === null
		? { type: annotation }
		: null;
}

function identifierValueEvidence(
	identifier: Syntax<ESTree.IdentifierReference>,
	resolution: ValueEvidenceResolution,
): KnownValueEvidence | null {
	const variable = resolveLexicalVariable(resolution.scopes, identifier);
	if (variable === null || resolution.visitedBindings.has(variable)) {
		return null;
	}
	const annotatedIdentifier = variable.identifiers.find(
		(binding) =>
			binding.typeAnnotation !== null && binding.typeAnnotation !== undefined,
	);
	const annotation = annotatedIdentifier?.typeAnnotation?.typeAnnotation;
	if (annotation !== undefined && annotatedIdentifier !== undefined) {
		return annotatedValueEvidence(
			annotatedIdentifier,
			annotation,
			resolution.boundary,
		);
	}
	return constantValueEvidence(variable, resolution);
}

function constantValueEvidence(
	variable: Binding,
	{ scopes, boundary, visitedBindings }: ValueEvidenceResolution,
): KnownValueEvidence | null {
	const declarator = variableDeclarator(variable);
	if (
		declarator?.parent.type !== "VariableDeclaration" ||
		declarator.parent.kind !== "const" ||
		declarator.init === null ||
		variable.references.some(
			(reference) => reference.isWrite() && !reference.init,
		) ||
		functionBoundary(declarator) !== boundary
	) {
		return null;
	}
	return knownValueEvidence(declarator.init, {
		boundary,
		scopes,
		visitedBindings: new Set([...visitedBindings, variable]),
	});
}

interface WidenedInitializer {
	readonly broadKind: BroadTypeKind;
	readonly expression: Syntax<ESTree.Expression>;
}

function widenedInitializer(
	identifier: Syntax<ESTree.BindingIdentifier>,
	initializer: Syntax<ESTree.Expression>,
): WidenedInitializer | null {
	const declaredType = identifier.typeAnnotation?.typeAnnotation;
	const initializerAssertion = assertionFromExpression(initializer);
	const initializerBroadKind =
		initializerAssertion === null
			? null
			: broadTypeKind(initializerAssertion.typeAnnotation);
	const declaredBroadKind =
		declaredType === undefined ? null : broadTypeKind(declaredType);
	const broadKind = declaredBroadKind ?? initializerBroadKind;
	if (broadKind === null) {
		return null;
	}
	return {
		broadKind,
		expression:
			initializerAssertion !== null && initializerBroadKind !== null
				? assertedExpression(initializerAssertion)
				: initializer,
	};
}

interface WidenedBinding {
	readonly boundary: Syntax<ESTree.Node> | null;
	readonly broadKind: BroadTypeKind;
	readonly declaredAt: number;
	readonly evidence: KnownValueEvidence;
}

function widenedBinding(
	variable: Binding,
	scopes: readonly LexicalScope[],
): WidenedBinding | null {
	const declarator = variableDeclarator(variable);
	if (
		declarator?.parent.type !== "VariableDeclaration" ||
		declarator.parent.kind !== "const" ||
		declarator.id.type !== "Identifier" ||
		declarator.init === null ||
		variable.references.some(
			(reference) => reference.isWrite() && !reference.init,
		)
	) {
		return null;
	}
	const initializer = widenedInitializer(declarator.id, declarator.init);
	if (initializer === null) {
		return null;
	}
	const boundary = functionBoundary(declarator);
	const evidence = knownValueEvidence(initializer.expression, {
		boundary,
		scopes,
		visitedBindings: new Set([variable]),
	});
	return evidence === null
		? null
		: {
				boundary,
				broadKind: initializer.broadKind,
				declaredAt: declarator.end,
				evidence,
			};
}

export { functionBoundary, widenedBinding };
