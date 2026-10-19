import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import { resolveVariable } from "./bindings.ts";
import type { RuleSource } from "./bindings.ts";
import runtimeExports from "./runtime-export-syntax.ts";
import type { Syntax } from "./syntax.ts";

const EMPTY_COLLECTION_LENGTH = 0;

const moduleMockMethods = new Set(["doMock", "mock", "unstable_mockModule"]);

function importedName(node: Syntax<ESTree.Node>): string | null {
	if (node.type !== "ImportSpecifier") {
		return null;
	}
	return node.imported.type === "Identifier"
		? node.imported.name
		: node.imported.value;
}

function isTestFrameworkObject(
	sourceCode: RuleSource,
	expression: Syntax<ESTree.Expression>,
): expression is Syntax<ESTree.IdentifierReference> {
	if (expression.type !== "Identifier") {
		return false;
	}

	const variable = resolveVariable(sourceCode, expression);
	if (variable === null || variable.defs.length === EMPTY_COLLECTION_LENGTH) {
		return expression.name === "vi" || expression.name === "jest";
	}
	return variable.defs.some((definition) => {
		if (
			definition.type !== "ImportBinding" ||
			definition.parent?.type !== "ImportDeclaration"
		) {
			return false;
		}
		const source = definition.parent.source.value;
		const name = importedName(definition.node);
		return (
			(source === "vitest" && name === "vi") ||
			(source === "@jest/globals" && name === "jest")
		);
	});
}

function moduleMockCall(
	sourceCode: RuleSource,
	callee: Syntax<ESTree.Expression>,
): boolean {
	if (
		!("property" in callee) ||
		!("object" in callee) ||
		!("computed" in callee)
	) {
		return false;
	}
	if (!isTestFrameworkObject(sourceCode, callee.object)) {
		return false;
	}
	const { property } = callee;
	if (!callee.computed) {
		return (
			property.type === "Identifier" && moduleMockMethods.has(property.name)
		);
	}
	return (
		property.type === "Literal" &&
		(property.value === "doMock" ||
			property.value === "mock" ||
			property.value === "unstable_mockModule")
	);
}

/** Ban test framework module mocking in favor of real dependency seams. */
const noModuleMockingRule = defineRule({
	createOnce(context) {
		return {
			CallExpression(node) {
				if (
					node.callee.type === "Super" ||
					node.callee.type === "V8IntrinsicExpression"
				) {
					return;
				}
				if (moduleMockCall(context.sourceCode, node.callee)) {
					context.report({
						messageId: "moduleMock",
						node: { range: [node.start, node.end] },
					});
				}
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow Vitest and Jest module mocking; tests must replace dependencies through real interfaces.",
		},
		messages: {
			moduleMock:
				"Replace module mocking with dependency injection through a real interface, service layer, or faithful test implementation.",
		},
		type: "problem",
	},
});

const SINGLE_RUNTIME_EXPORT = 1;

const preferDefaultRuntimeExportRule = defineRule({
	createOnce(context) {
		return {
			Program(node) {
				const declarations = node.body.flatMap(runtimeExports);
				const named = declarations.filter((entry) => entry.kind === "named");
				if (named.length !== declarations.length) {
					return;
				}

				const entries = new Map(named.map((entry) => [entry.name, entry]));
				const [entry] = entries.values();
				if (
					entries.size !== SINGLE_RUNTIME_EXPORT ||
					entry === undefined ||
					entry.name === "default"
				) {
					return;
				}

				context.report({
					messageId: "defaultRuntime",
					node: { range: [entry.start, entry.end] },
				});
			},
		};
	},
	meta: {
		docs: {
			description:
				"Require a default export for a module's sole runtime entry, excluding type exports from the count.",
		},
		messages: {
			defaultRuntime:
				"Export the sole runtime entry as default. Named type exports do not make this a multiple-runtime-entry module.",
		},
		type: "suggestion",
	},
});

export { noModuleMockingRule, preferDefaultRuntimeExportRule };
