import type { ESTree } from "@oxlint/plugins";

import { resolveVariable } from "./bindings.ts";
import type { RuleSource } from "./bindings.ts";
import type { Syntax } from "./syntax.ts";

const EMPTY_COLLECTION_LENGTH = 0;

function isGlobalReflect(
	sourceCode: RuleSource,
	expression: Syntax<ESTree.Expression>,
): boolean {
	if (expression.type !== "Identifier" || expression.name !== "Reflect") {
		return false;
	}

	const variable = resolveVariable(sourceCode, expression);
	return variable === null || variable.defs.length === EMPTY_COLLECTION_LENGTH;
}

/** Reports whether a call target names one method on the global Reflect object. */
function isGlobalReflectMethodCall(
	sourceCode: RuleSource,
	callee: Syntax<ESTree.Expression>,
	methodName: string,
): boolean {
	if (
		!("property" in callee) ||
		!("object" in callee) ||
		!("computed" in callee)
	) {
		return false;
	}
	if (!isGlobalReflect(sourceCode, callee.object)) {
		return false;
	}
	const { property } = callee;
	return callee.computed
		? property.type === "Literal" && property.value === methodName
		: property.type === "Identifier" && property.name === methodName;
}

export { isGlobalReflectMethodCall as default };
