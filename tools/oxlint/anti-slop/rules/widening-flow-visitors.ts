import type { ESTree } from "@oxlint/plugins";

import { resolveVariable } from "./bindings.ts";
import type { RuleSource } from "./bindings.ts";
import { variableDeclarator } from "./known-value-expressions.ts";
import {
	enclosingFunction,
	functionName,
	sourceKeyName,
} from "./known-value-flow.ts";
import type { WideningFlow } from "./known-value-flow.ts";
import type { Syntax } from "./syntax.ts";

function checkProperty(
	source: RuleSource,
	flow: WideningFlow,
	node: Syntax<ESTree.AccessorProperty> | Syntax<ESTree.PropertyDefinition>,
): void {
	if (node.value === null) {
		return;
	}
	flow.annotation(
		node.value,
		node.typeAnnotation,
		`property \`${sourceKeyName(source, node.key)}\``,
	);
}

function checkExpressionBody(
	source: RuleSource,
	flow: WideningFlow,
	node: Syntax<ESTree.ArrowFunctionExpression>,
): void {
	if (node.body.type === "BlockStatement") {
		return;
	}
	flow.annotation(
		node.body,
		node.returnType,
		`return value of \`${functionName(source, node)}\``,
	);
}

function checkAssignment(
	source: RuleSource,
	flow: WideningFlow,
	node: Syntax<ESTree.AssignmentExpression>,
): void {
	if (node.operator !== "=" || node.left.type !== "Identifier") {
		return;
	}
	const variable = resolveVariable(source, node.left);
	if (variable === null) {
		return;
	}
	const declarator = variableDeclarator(variable);
	if (declarator?.id.type !== "Identifier") {
		return;
	}
	flow.annotation(
		node.right,
		declarator.id.typeAnnotation,
		`binding \`${declarator.id.name}\``,
	);
}

function checkReturn(
	source: RuleSource,
	flow: WideningFlow,
	node: Syntax<ESTree.ReturnStatement>,
): void {
	if (node.argument === null) {
		return;
	}
	const owner = enclosingFunction(node);
	flow.annotation(
		node.argument,
		owner?.returnType,
		`return value of \`${functionName(source, owner)}\``,
	);
}

function checkVariable(
	flow: WideningFlow,
	node: Syntax<ESTree.VariableDeclarator>,
): void {
	if (node.init === null || node.id.type !== "Identifier") {
		return;
	}
	flow.annotation(
		node.init,
		node.id.typeAnnotation,
		`binding \`${node.id.name}\``,
	);
}

export {
	checkAssignment,
	checkExpressionBody,
	checkProperty,
	checkReturn,
	checkVariable,
};
