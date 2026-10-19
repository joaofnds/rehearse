import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { classifyUnsafeDictionary } from "./dictionary-types.ts";
import { createWideningFlow } from "./known-value-flow.ts";
import type { Syntax } from "./syntax.ts";
import { createTypeEnvironment } from "./type-environment.ts";
import type { TypeEnvironment } from "./type-environment.ts";
import { classifyUnsafeDictionaryValue } from "./unsafe-dictionary-values.ts";
import type { UnsafeDictionary } from "./unsafe-dictionary-values.ts";
import {
	checkAssignment,
	checkExpressionBody,
	checkProperty,
	checkReturn,
	checkVariable,
} from "./widening-flow-visitors.ts";

const EMPTY_COLLECTION_LENGTH = 0;

const typeNodeKinds: ReadonlySet<string> = new Set([
	"JSDocNonNullableType",
	"JSDocNullableType",
	"JSDocUnknownType",
	"TSAnyKeyword",
	"TSArrayType",
	"TSBigIntKeyword",
	"TSBooleanKeyword",
	"TSConditionalType",
	"TSConstructorType",
	"TSFunctionType",
	"TSImportType",
	"TSIndexedAccessType",
	"TSInferType",
	"TSIntersectionType",
	"TSIntrinsicKeyword",
	"TSLiteralType",
	"TSMappedType",
	"TSNamedTupleMember",
	"TSNeverKeyword",
	"TSNullKeyword",
	"TSNumberKeyword",
	"TSObjectKeyword",
	"TSParenthesizedType",
	"TSStringKeyword",
	"TSSymbolKeyword",
	"TSTemplateLiteralType",
	"TSThisType",
	"TSTupleType",
	"TSTypeLiteral",
	"TSTypeOperator",
	"TSTypePredicate",
	"TSTypeQuery",
	"TSTypeReference",
	"TSUndefinedKeyword",
	"TSUnionType",
	"TSUnknownKeyword",
	"TSVoidKeyword",
]);

function isTypeNode(node: Syntax<ESTree.Node>): node is Syntax<ESTree.TSType> {
	return typeNodeKinds.has(node.type);
}

function typeReferenceName(
	type: Syntax<ESTree.TSTypeReference>,
): string | null {
	return type.typeName.type === "Identifier" ? type.typeName.name : null;
}

function isInsideTypeAliasDeclaration(node: Syntax<ESTree.Node>): boolean {
	let current: Syntax<ESTree.Node> | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (current.type === "TSTypeAliasDeclaration") {
			return true;
		}
		current = current.parent;
	}
	return false;
}

function isPlainAliasConsumerUse(
	node: Syntax<ESTree.TSType>,
	environment: TypeEnvironment,
): boolean {
	if (
		node.type !== "TSTypeReference" ||
		(node.typeArguments?.params.length ?? EMPTY_COLLECTION_LENGTH) >
			EMPTY_COLLECTION_LENGTH
	) {
		return false;
	}
	const name = typeReferenceName(node);
	return (
		name !== null &&
		environment.aliases.has(name) &&
		!isInsideTypeAliasDeclaration(node)
	);
}

function shouldReportType(
	node: Syntax<ESTree.TSType>,
	environment: TypeEnvironment,
): boolean {
	if (isPlainAliasConsumerUse(node, environment)) {
		return false;
	}
	if (classifyUnsafeDictionary(node, environment) === null) {
		return false;
	}
	let current: Syntax<ESTree.Node> | null = node.parent;
	while (current !== null && current.type !== "Program") {
		if (
			isTypeNode(current) &&
			classifyUnsafeDictionary(current, environment) !== null
		) {
			return false;
		}
		current = current.parent;
	}
	return true;
}

function standaloneIndexSignatureValue(
	node: Syntax<ESTree.TSIndexSignature>,
	environment: TypeEnvironment | null,
): UnsafeDictionary["unsafeValue"] | null {
	if (
		environment === null ||
		node.typeAnnotation === null ||
		node.parent.type === "TSTypeLiteral"
	) {
		return null;
	}
	return (
		classifyUnsafeDictionaryValue(
			node.typeAnnotation.typeAnnotation,
			environment,
		)?.unsafeValue ?? null
	);
}

/** Disallow object-dictionary contracts whose direct value type is an unsafe escape hatch. */
const noUnsafeDictionaryTypeRule = defineRule({
	createOnce(context) {
		let environment: TypeEnvironment | null = null;
		const report = (node: Syntax<ESTree.Node>, value: string): void => {
			context.report({
				data: { value },
				messageId: "unsafeDictionary",
				node: { range: [node.start, node.end] },
			});
		};
		const reportIfUnsafe = (node: Syntax<ESTree.TSType>): void => {
			if (environment === null || !shouldReportType(node, environment)) {
				return;
			}
			const unsafe = classifyUnsafeDictionary(node, environment);
			if (unsafe === null) {
				return;
			}
			report(node, unsafe.unsafeValue);
		};

		return {
			Program(node) {
				environment = createTypeEnvironment(node);
			},
			TSIndexSignature(node) {
				const value = standaloneIndexSignatureValue(node, environment);
				if (value !== null) {
					report(node, value);
				}
			},
			TSMappedType(node) {
				reportIfUnsafe(node);
			},
			TSTypeLiteral(node) {
				reportIfUnsafe(node);
			},
			TSTypeReference(node) {
				reportIfUnsafe(node);
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow object-dictionary contracts whose direct value type is unknown, any, object, {}, or a union/alias containing one of those escape hatches.",
		},
		messages: {
			unsafeDictionary:
				"This dictionary's {{value}} value type gives callers no concrete value contract. Use an owner/schema-derived value type; parse external payloads before insertion.",
		},
		type: "problem",
	},
});

/** Detect sound syntactic cases where a known value is explicitly widened and loses evidence. */
const noKnownValueWideningRule = defineRule({
	createOnce(context) {
		const flow = createWideningFlow(context);
		return {
			AccessorProperty(node) {
				checkProperty(context.sourceCode, flow, node);
			},
			ArrowFunctionExpression(node) {
				checkExpressionBody(context.sourceCode, flow, node);
			},
			AssignmentExpression(node) {
				checkAssignment(context.sourceCode, flow, node);
			},
			Program(node) {
				flow.program(node);
			},
			PropertyDefinition(node) {
				checkProperty(context.sourceCode, flow, node);
			},
			ReturnStatement(node) {
				checkReturn(context.sourceCode, flow, node);
			},
			TSAsExpression(node) {
				flow.assertion(node);
			},
			TSTypeAssertion(node) {
				flow.assertion(node);
			},
			VariableDeclarator(node) {
				checkVariable(flow, node);
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow syntactically established values from flowing into explicitly broad or anonymous target types that discard useful evidence.",
		},
		messages: {
			widening:
				"The explicit {{target}} type on {{subject}} discards known type evidence. Keep inference, validate with `satisfies`, or use a named owner contract.",
		},
		type: "problem",
	},
});

export { noKnownValueWideningRule, noUnsafeDictionaryTypeRule };
