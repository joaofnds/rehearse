import type { ESTree } from "@oxlint/plugins";

import { resolveVariable } from "./bindings.ts";
import type { RuleSource } from "./bindings.ts";
import { unwrapExpression } from "./known-value-expressions.ts";
import {
	isTypeQuery,
	localConstant,
	outerExpression,
} from "./numeric-projection-bindings.ts";
import { numericProperty, propertyName } from "./numeric-projection-syntax.ts";
import type { Binding, Syntax } from "./syntax.ts";

const EMPTY_COLLECTION_LENGTH = 0;
const SINGLE_ARGUMENT_COUNT = 1;

function isNativeFreeze(
	source: RuleSource,
	callee: Syntax<ESTree.Expression>,
): boolean {
	const target = unwrapExpression(callee);
	if (
		target.type !== "MemberExpression" ||
		propertyName(target.property, target.computed) !== "freeze"
	) {
		return false;
	}

	const object = unwrapExpression(target.object);
	if (object.type !== "Identifier" || object.name !== "Object") {
		return false;
	}

	const binding = resolveVariable(source, object);

	return binding === null || binding.defs.length === EMPTY_COLLECTION_LENGTH;
}

function numericInitializer(
	source: RuleSource,
	node: Syntax<ESTree.Expression>,
): Syntax<ESTree.Expression> {
	const expression = unwrapExpression(node);
	if (
		expression.type !== "CallExpression" ||
		expression.optional ||
		expression.arguments.length !== SINGLE_ARGUMENT_COUNT ||
		!isNativeFreeze(source, expression.callee)
	) {
		return expression;
	}

	const [argument] = expression.arguments;

	return argument === undefined || argument.type === "SpreadElement"
		? expression
		: numericInitializer(source, argument);
}

function numericObjectKeys(
	source: RuleSource,
	initializer: Syntax<ESTree.Expression>,
): readonly string[] | null {
	const object = numericInitializer(source, initializer);
	if (
		object.type !== "ObjectExpression" ||
		object.properties.length === EMPTY_COLLECTION_LENGTH
	) {
		return null;
	}

	const keys = object.properties.map(numericProperty);

	return keys.every((key) => key !== null) ? keys : null;
}

interface ExpressionParent {
	readonly expression: Syntax<ESTree.Node>;
	readonly parent: Syntax<ESTree.Node>;
}

function isDirectMutation({ expression, parent }: ExpressionParent): boolean {
	return (
		(parent.type === "AssignmentExpression" && parent.left === expression) ||
		(parent.type === "UpdateExpression" && parent.argument === expression) ||
		(parent.type === "UnaryExpression" &&
			parent.operator === "delete" &&
			parent.argument === expression) ||
		((parent.type === "ForInStatement" || parent.type === "ForOfStatement") &&
			parent.left === expression)
	);
}

function isPatternContainer({ expression, parent }: ExpressionParent): boolean {
	return (
		parent.type === "ArrayPattern" ||
		parent.type === "ObjectPattern" ||
		(parent.type === "RestElement" && parent.argument === expression) ||
		(parent.type === "AssignmentPattern" && parent.left === expression) ||
		(parent.type === "Property" &&
			parent.value === expression &&
			parent.parent.type === "ObjectPattern")
	);
}

function isWriteTarget(node: Syntax<ESTree.Node>): boolean {
	const expression = outerExpression(node);
	const { parent } = expression;
	if (parent === null) {
		return false;
	}

	return (
		isDirectMutation({ expression, parent }) ||
		(isPatternContainer({ expression, parent }) && isWriteTarget(parent))
	);
}

function isScalarRead(
	node: Syntax<ESTree.Node>,
	keys: readonly string[],
): boolean {
	const expression = outerExpression(node);
	const { parent } = expression;
	if (parent?.type !== "MemberExpression" || parent.object !== expression) {
		return false;
	}

	const key = propertyName(parent.property, parent.computed);

	return key !== null && keys.includes(key) && !isWriteTarget(parent);
}

function unpacksNumericObject(
	pattern: Syntax<ESTree.ObjectPattern>,
	keys: readonly string[],
): boolean {
	return (
		pattern.properties.length > EMPTY_COLLECTION_LENGTH &&
		pattern.properties.every((property) => {
			if (
				property.type !== "Property" ||
				property.value.type !== "Identifier"
			) {
				return false;
			}

			const key = propertyName(property.key, property.computed);

			return key !== null && keys.includes(key);
		})
	);
}

function isScalarConsumer(
	node: Syntax<ESTree.Node>,
	keys: readonly string[],
): boolean {
	const expression = outerExpression(node);
	const { parent } = expression;
	if (
		parent?.type === "VariableDeclarator" &&
		parent.init === expression &&
		parent.id.type === "ObjectPattern"
	) {
		return unpacksNumericObject(parent.id, keys);
	}

	return isScalarRead(node, keys);
}

interface WrapperBinding {
	readonly source: RuleSource;
	readonly variable: Binding;
	readonly identifier: Syntax<ESTree.IdentifierReference>;
}

function scalarWrapperBinding({
	source,
	variable,
	identifier,
}: WrapperBinding): boolean {
	const initializer = localConstant(variable);
	const keys =
		initializer === null ? null : numericObjectKeys(source, initializer);
	if (keys === null) {
		return false;
	}

	const consumers = variable.references.filter(
		(reference) => !reference.init && !isTypeQuery(reference.identifier),
	);

	const [firstConsumer] = consumers;

	return (
		firstConsumer !== undefined &&
		firstConsumer.identifier.start === identifier.start &&
		consumers.every((reference) => isScalarConsumer(reference.identifier, keys))
	);
}

function projectedLiteral(
	source: RuleSource,
	node: Syntax<ESTree.MemberExpression>,
): boolean {
	const keys = numericObjectKeys(source, node.object);
	const key = propertyName(node.property, node.computed);

	return (
		keys !== null && key !== null && keys.includes(key) && !isWriteTarget(node)
	);
}

function boundScalarWrapper(
	source: RuleSource,
	identifier: Syntax<ESTree.IdentifierReference>,
): boolean {
	const variable = resolveVariable(source, identifier);

	return (
		variable !== null && scalarWrapperBinding({ identifier, source, variable })
	);
}

function isNumericScalarWrapper(
	source: RuleSource,
	node: Syntax<ESTree.MemberExpression>,
): boolean {
	const object = unwrapExpression(node.object);

	return object.type === "Identifier"
		? boundScalarWrapper(source, object)
		: projectedLiteral(source, node);
}

function isNumericScalarUnpacking(
	source: RuleSource,
	node: Syntax<ESTree.VariableDeclarator>,
): boolean {
	if (node.id.type !== "ObjectPattern" || node.init === null) {
		return false;
	}

	const initializer = unwrapExpression(node.init);
	if (initializer.type === "Identifier") {
		return boundScalarWrapper(source, initializer);
	}

	const keys = numericObjectKeys(source, initializer);

	return keys !== null && unpacksNumericObject(node.id, keys);
}

export { isNumericScalarWrapper as default, isNumericScalarUnpacking };
