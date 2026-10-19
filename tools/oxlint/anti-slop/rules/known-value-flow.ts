import type { Context, ESTree } from "@oxlint/plugins";

import type { RuleSource } from "./bindings.ts";
import { sourceText } from "./bindings.ts";
import {
	hasKnownEvidence,
	unwrapExpression,
} from "./known-value-expressions.ts";
import type { Syntax } from "./syntax.ts";
import { createTypeEnvironment } from "./type-environment.ts";
import type { TypeEnvironment } from "./type-environment.ts";
import classifyWideningTarget from "./widening-targets.ts";
import type { WideningTarget } from "./widening-targets.ts";

type FunctionExpression =
	| Syntax<ESTree.ArrowFunctionExpression>
	| Syntax<ESTree.Function>;

const EMPTY_OBJECT_PROPERTY_COUNT = 0;

function annotationTarget(
	annotation: Syntax<ESTree.TSTypeAnnotation> | null | undefined,
	environment: TypeEnvironment,
): WideningTarget | null {
	return annotation === null || annotation === undefined
		? null
		: classifyWideningTarget(annotation.typeAnnotation, environment);
}

function enclosingFunction(
	node: Syntax<ESTree.Node>,
): FunctionExpression | null {
	let current: Syntax<ESTree.Node> | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (
			current.type === "ArrowFunctionExpression" ||
			current.type === "FunctionDeclaration" ||
			current.type === "FunctionExpression"
		) {
			return current;
		}
		current = current.parent;
	}
	return null;
}

function sourceKeyName(
	sourceCode: RuleSource,
	key: Syntax<ESTree.PropertyKey>,
): string {
	if (key.type === "Identifier" || key.type === "PrivateIdentifier") {
		return key.name;
	}
	if (key.type === "Literal") {
		if ("regex" in key) {
			return key.value === null
				? "null"
				: `/${key.value.source}/${key.value.flags}`;
		}
		return String(key.value);
	}
	return sourceText(sourceCode, key);
}

function functionName(
	sourceCode: RuleSource,
	owner: FunctionExpression | null,
): string {
	if (owner === null) {
		return "anonymous function";
	}
	if (owner.id !== null) {
		return owner.id.name;
	}
	const { parent } = owner;
	if (parent.type === "VariableDeclarator" && parent.id.type === "Identifier") {
		return parent.id.name;
	}
	if (parent.type === "MethodDefinition") {
		return sourceKeyName(sourceCode, parent.key);
	}
	return "anonymous function";
}

function isEmptyObjectExpression(
	expression: Syntax<ESTree.Expression>,
): boolean {
	const unwrapped = unwrapExpression(expression);
	return (
		unwrapped.type === "ObjectExpression" &&
		unwrapped.properties.length === EMPTY_OBJECT_PROPERTY_COUNT
	);
}

function isDictionaryAccumulatorTarget(destination: WideningTarget): boolean {
	return (
		destination.kind === "open dictionary" ||
		destination.kind === "generic container"
	);
}

function hasParentAssertion(node: Syntax<ESTree.Node>): boolean {
	return (
		node.parent?.type === "TSAsExpression" ||
		node.parent?.type === "TSTypeAssertion"
	);
}

interface WideningFlowReport {
	readonly destination: WideningTarget | null;
	readonly expression: Syntax<ESTree.Expression>;
	readonly subject: string;
}

interface WideningDiagnostics {
	readonly report: Context["report"];
	readonly sourceCode: RuleSource;
}

function reportFlow(
	context: WideningDiagnostics,
	{ destination, expression, subject }: WideningFlowReport,
): void {
	if (destination === null) {
		return;
	}
	if (
		isDictionaryAccumulatorTarget(destination) &&
		isEmptyObjectExpression(expression)
	) {
		return;
	}
	if (!hasKnownEvidence(context.sourceCode, expression)) {
		return;
	}
	context.report({
		data: { subject, target: destination.kind },
		messageId: "widening",
		node: { range: [expression.start, expression.end] },
	});
}

interface WideningFlow {
	readonly annotation: (
		expression: Syntax<ESTree.Expression>,
		annotation: Syntax<ESTree.TSTypeAnnotation> | null | undefined,
		subject: string,
	) => void;
	readonly assertion: (
		node: Syntax<ESTree.TSAsExpression> | Syntax<ESTree.TSTypeAssertion>,
	) => void;
	readonly program: (node: Syntax<ESTree.Program>) => void;
}

function createWideningFlow(context: WideningDiagnostics): WideningFlow {
	let environment: TypeEnvironment | null = null;
	return {
		annotation(expression, annotation, subject) {
			reportFlow(context, {
				destination:
					environment === null
						? null
						: annotationTarget(annotation, environment),
				expression,
				subject,
			});
		},
		assertion(node) {
			if (environment === null || hasParentAssertion(node)) {
				return;
			}
			reportFlow(context, {
				destination: classifyWideningTarget(node.typeAnnotation, environment),
				expression: node.expression,
				subject: "assertion",
			});
		},
		program(node) {
			environment = createTypeEnvironment(node);
		},
	};
}

export { createWideningFlow, enclosingFunction, functionName, sourceKeyName };
export type { WideningFlow };
