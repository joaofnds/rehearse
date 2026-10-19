import type { ESTree } from "@oxlint/plugins";
import { z } from "zod";

import { unwrapExpression } from "./known-value-expressions.ts";
import type { Syntax } from "./syntax.ts";

const SINGLE_ELEMENT_LENGTH = 1;
const EMPTY_COLLECTION_LENGTH = 0;
const numericLiteralValue = z.union([
	z.number(),
	z.literal(Number.POSITIVE_INFINITY),
]);
const propertyKeyValue = z.union([z.string(), numericLiteralValue]);

interface NumericRecords {
	readonly keys: readonly string[];
}

function memberReceiverName(node: Syntax<ESTree.Expression>): string | null {
	const receiver = unwrapExpression(node);
	return receiver.type === "Identifier" ? receiver.name : null;
}

function propertyName(
	node: Syntax<ESTree.PropertyKey>,
	computed = false,
): string | null {
	if (node.type === "Identifier" && !computed) {
		return node.name;
	}

	if (node.type === "Literal") {
		const parsed = propertyKeyValue.safeParse(node.value);
		return parsed.success ? String(parsed.data) : null;
	}

	return null;
}

function isNumericLiteral(node: Syntax<ESTree.Expression>): boolean {
	const value = unwrapExpression(node);
	if (
		value.type === "UnaryExpression" &&
		(value.operator === "-" || value.operator === "+")
	) {
		return isNumericLiteral(value.argument);
	}

	return (
		value.type === "Literal" &&
		numericLiteralValue.safeParse(value.value).success
	);
}

function numericProperty(
	property: Syntax<ESTree.ObjectExpression["properties"][number]>,
): string | null {
	if (
		property.type !== "Property" ||
		property.kind !== "init" ||
		!isNumericLiteral(property.value)
	) {
		return null;
	}

	const key = propertyName(property.key, property.computed);

	return key === "__proto__" && !property.computed ? null : key;
}

function numericObjectKey(
	node: Syntax<ESTree.ArrayExpressionElement>,
): string | null {
	if (node === null || node.type === "SpreadElement") {
		return null;
	}

	const object = unwrapExpression(node);
	if (
		object.type !== "ObjectExpression" ||
		object.properties.length !== SINGLE_ELEMENT_LENGTH
	) {
		return null;
	}

	const [property] = object.properties;
	return property === undefined ? null : numericProperty(property);
}

function returnedExpression(
	body: Syntax<ESTree.FunctionBody | ESTree.Expression> | null,
): Syntax<ESTree.Expression> | null {
	if (body === null) {
		return null;
	}

	if (body.type !== "BlockStatement") {
		return unwrapExpression(body);
	}

	const [statement] = body.body;

	return body.body.length === SINGLE_ELEMENT_LENGTH &&
		statement?.type === "ReturnStatement" &&
		statement.argument !== null
		? unwrapExpression(statement.argument)
		: null;
}

function returnsProperty(
	parameter: Syntax<ESTree.ParamPattern>,
	returned: Syntax<ESTree.Expression>,
	key: string,
): boolean {
	if (parameter.type === "Identifier") {
		return (
			returned.type === "MemberExpression" &&
			memberReceiverName(returned.object) === parameter.name &&
			propertyName(returned.property, returned.computed) === key
		);
	}

	if (
		parameter.type !== "ObjectPattern" ||
		parameter.properties.length !== SINGLE_ELEMENT_LENGTH
	) {
		return false;
	}

	const [property] = parameter.properties;

	return (
		property?.type === "Property" &&
		propertyName(property.key, property.computed) === key &&
		property.value.type === "Identifier" &&
		returned.type === "Identifier" &&
		property.value.name === returned.name
	);
}

function isPropertyProjection(
	node: Syntax<ESTree.Argument>,
	key: string,
): boolean {
	if (
		node.type !== "ArrowFunctionExpression" &&
		node.type !== "FunctionExpression"
	) {
		return false;
	}

	if (
		node.async ||
		node.generator ||
		node.params.length !== SINGLE_ELEMENT_LENGTH
	) {
		return false;
	}

	const [parameter] = node.params;
	const returned = returnedExpression(node.body);

	return (
		parameter !== undefined &&
		returned !== null &&
		returnsProperty(parameter, returned, key)
	);
}

function numericRecords(
	node: Syntax<ESTree.Expression>,
): NumericRecords | null {
	const array = unwrapExpression(node);
	if (
		array.type !== "ArrayExpression" ||
		array.elements.length === EMPTY_COLLECTION_LENGTH
	) {
		return null;
	}

	const keys = array.elements.map(numericObjectKey);

	return keys.every((key) => key !== null) ? { keys } : null;
}

function unpacksScalars(
	pattern: Syntax<ESTree.BindingPattern>,
	records: NumericRecords,
): boolean {
	return (
		pattern.type === "ArrayPattern" &&
		pattern.elements.length === records.keys.length &&
		pattern.elements.every(
			(element, index) =>
				element?.type === "ObjectPattern" &&
				element.properties.length === SINGLE_ELEMENT_LENGTH &&
				element.properties.every(
					(property) =>
						property.type === "Property" &&
						propertyName(property.key, property.computed) ===
							records.keys[index] &&
						property.value.type === "Identifier",
				),
		)
	);
}

function projectsScalars(
	node: Syntax<ESTree.CallExpression>,
	records: NumericRecords,
): boolean {
	const callee = unwrapExpression(node.callee);
	const [callback] = node.arguments;

	return (
		callee.type === "MemberExpression" &&
		propertyName(callee.property, callee.computed) === "map" &&
		node.arguments.length === SINGLE_ELEMENT_LENGTH &&
		callback !== undefined &&
		callback.type !== "SpreadElement" &&
		records.keys.every((key) =>
			isPropertyProjection(unwrapExpression(callback), key),
		)
	);
}

export {
	numericRecords,
	projectsScalars,
	unpacksScalars,
	propertyName,
	numericProperty,
};
export type { NumericRecords };
