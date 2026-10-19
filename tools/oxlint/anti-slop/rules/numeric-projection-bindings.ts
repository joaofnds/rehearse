import type { ESTree } from "@oxlint/plugins";

import { resolveVariable } from "./bindings.ts";
import type { RuleSource } from "./bindings.ts";
import {
	unwrapExpression,
	variableDeclarator,
} from "./known-value-expressions.ts";
import {
	numericRecords,
	projectsScalars,
	unpacksScalars,
} from "./numeric-projection-syntax.ts";
import type { NumericRecords } from "./numeric-projection-syntax.ts";
import type { Binding, Syntax } from "./syntax.ts";

function outerExpression(node: Syntax<ESTree.Node>): Syntax<ESTree.Node> {
	let current = node;
	while (
		current.parent !== null &&
		(current.parent.type === "ParenthesizedExpression" ||
			current.parent.type === "TSAsExpression" ||
			current.parent.type === "TSSatisfiesExpression" ||
			current.parent.type === "TSTypeAssertion" ||
			current.parent.type === "TSNonNullExpression")
	) {
		current = current.parent;
	}

	return current;
}

function isTypeQuery(node: Syntax<ESTree.Node>): boolean {
	let current = node;
	while (current.parent?.type === "TSQualifiedName") {
		current = current.parent;
	}

	return current.parent?.type === "TSTypeQuery";
}

function isScalarConsumer(
	node: Syntax<ESTree.Node>,
	records: NumericRecords,
): boolean {
	const expression = outerExpression(node);
	const { parent } = expression;
	if (parent?.type === "VariableDeclarator" && parent.init === expression) {
		return unpacksScalars(parent.id, records);
	}

	if (parent?.type !== "MemberExpression" || parent.object !== expression) {
		return false;
	}

	const callee = outerExpression(parent);

	return (
		callee.parent?.type === "CallExpression" &&
		callee.parent.callee === callee &&
		projectsScalars(callee.parent, records)
	);
}

function localConstant(variable: Binding): Syntax<ESTree.Expression> | null {
	const declaration = variableDeclarator(variable);
	if (
		declaration?.parent.type !== "VariableDeclaration" ||
		declaration.parent.kind !== "const" ||
		declaration.id.type !== "Identifier" ||
		declaration.parent.parent.type === "ExportNamedDeclaration" ||
		variable.references.some(
			(reference) => reference.isWrite() && !reference.init,
		)
	) {
		return null;
	}

	return declaration.init;
}

function boundNumericRecords(variable: Binding): NumericRecords | null {
	const initializer = localConstant(variable);
	const records = initializer === null ? null : numericRecords(initializer);

	return records !== null &&
		variable.references.every(
			(reference) =>
				reference.init ||
				isTypeQuery(reference.identifier) ||
				isScalarConsumer(reference.identifier, records),
		)
		? records
		: null;
}

function projectionRecords(
	source: RuleSource,
	expression: Syntax<ESTree.Expression>,
): NumericRecords | null {
	const unwrapped = unwrapExpression(expression);
	if (unwrapped.type !== "Identifier") {
		return numericRecords(unwrapped);
	}

	const variable = resolveVariable(source, unwrapped);

	return variable === null ? null : boundNumericRecords(variable);
}

export {
	projectionRecords as default,
	outerExpression,
	isTypeQuery,
	localConstant,
};
