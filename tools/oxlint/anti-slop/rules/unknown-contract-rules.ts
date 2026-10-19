import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import functionContractVisitors from "./function-contract-visitors.ts";
import type { FunctionContract } from "./function-contract-visitors.ts";
import lexicalTypeParameterNames from "./lexical-type-parameters.ts";
import { localTypeAliases } from "./local-type-aliases.ts";
import type { Syntax } from "./syntax.ts";
import resolvesAliasToUnknown from "./unknown-alias-types.ts";
import resolvesReturnToUnknown from "./unknown-return-types.ts";

type Parameter = Syntax<ESTree.ParamPattern>;

function parameterAnnotation(
	parameter: Parameter,
): Syntax<ESTree.TSTypeAnnotation> | null | undefined {
	if (parameter.type === "TSParameterProperty") {
		return parameterAnnotation(parameter.parameter);
	}
	if (parameter.type === "RestElement") {
		return parameter.typeAnnotation ?? parameterAnnotation(parameter.argument);
	}
	if (parameter.type === "AssignmentPattern") {
		return parameter.typeAnnotation ?? parameter.left.typeAnnotation;
	}
	return parameter.typeAnnotation;
}

function parameterName(parameter: Parameter, sourceText: string): string {
	if (parameter.type === "TSParameterProperty") {
		return parameterName(parameter.parameter, sourceText);
	}
	if (parameter.type === "AssignmentPattern") {
		return parameterName(parameter.left, sourceText);
	}
	if (parameter.type === "RestElement") {
		return parameterName(parameter.argument, sourceText);
	}
	return parameter.type === "Identifier"
		? parameter.name
		: sourceText.replace(/\s*:\s*unknown\s*$/u, "");
}

/** Disallow unknown inputs except explicitly named error-cause enrichment. */
const noUnknownParametersRule = defineRule({
	createOnce(context) {
		const checkParameters = (node: FunctionContract): void => {
			for (const parameter of node.params) {
				const annotation = parameterAnnotation(parameter);
				if (annotation?.typeAnnotation.type === "TSUnknownKeyword") {
					const name = parameterName(
						parameter,
						context.sourceCode.text.slice(parameter.start, parameter.end),
					);
					if (name !== "cause") {
						context.report({
							data: { parameter: name },
							messageId: "unknownParameter",
							node: {
								range: [
									annotation.typeAnnotation.start,
									annotation.typeAnnotation.end,
								],
							},
						});
					}
				}
			}
		};

		return functionContractVisitors(checkParameters);
	},
	meta: {
		docs: {
			description:
				"Disallow explicitly unknown function parameters except `cause`; decode unknown input at its I/O boundary instead.",
		},
		messages: {
			unknownParameter:
				"Parameter `{{parameter}}` leaves input unparsed. Accept a named domain type; run the expected schema or parser at the I/O boundary before calling this function.",
		},
		type: "problem",
	},
});

/** Ban function contracts that return unknown instead of a parsed domain type. */
const noUnknownReturnsRule = defineRule({
	createOnce(context) {
		const aliases = new Map<string, Syntax<ESTree.TSTypeAliasDeclaration>>();

		const checkReturnType = (node: FunctionContract): void => {
			const annotation = node.returnType;
			if (annotation === null || annotation === undefined) {
				return;
			}
			if (
				!resolvesReturnToUnknown(annotation.typeAnnotation, {
					aliases,
					shadowedAliases: lexicalTypeParameterNames(
						node,
						context.sourceCode.visitorKeys,
					),
					visited: new Set(),
				})
			) {
				return;
			}
			context.report({
				messageId: "unknownReturn",
				node: {
					range: [
						annotation.typeAnnotation.start,
						annotation.typeAnnotation.end,
					],
				},
			});
		};

		return {
			Program(node) {
				aliases.clear();
				for (const alias of localTypeAliases(node)) {
					aliases.set(alias.id.name, alias);
				}
			},
			...functionContractVisitors(checkReturnType),
		};
	},
	meta: {
		docs: {
			description:
				"Disallow functions whose explicit return contract is unknown or Promise<unknown>.",
		},
		messages: {
			unknownReturn:
				"This function exposes `unknown` to its caller. Parse the value at its boundary and return a named domain type.",
		},
		type: "problem",
	},
});

/** Ban named aliases that merely conceal TypeScript's unknown top type. */
const noUnknownTypeAliasesRule = defineRule({
	createOnce(context) {
		const aliases = new Map<string, Syntax<ESTree.TSTypeAliasDeclaration>>();

		const checkAlias = (alias: Syntax<ESTree.TSTypeAliasDeclaration>): void => {
			if (
				resolvesAliasToUnknown(alias.typeAnnotation, {
					aliases,
					visited: new Set([alias.id.name]),
				})
			) {
				context.report({
					data: { alias: alias.id.name },
					messageId: "unknownAlias",
					node: { range: [alias.id.start, alias.id.end] },
				});
			}
		};

		return {
			Program(node) {
				aliases.clear();
				for (const alias of localTypeAliases(node)) {
					aliases.set(alias.id.name, alias);
				}
				for (const alias of aliases.values()) {
					checkAlias(alias);
				}
			},
		};
	},
	meta: {
		docs: {
			description:
				"Disallow type aliases whose resolved type is unknown; unknown must remain visible at an allowed boundary.",
		},
		messages: {
			unknownAlias:
				"Type alias `{{alias}}` hides `unknown`. Keep `unknown` explicit at the parsing boundary or on an allowed `cause` field; otherwise use the parsed owner type.",
		},
		type: "problem",
	},
});

export {
	noUnknownParametersRule,
	noUnknownReturnsRule,
	noUnknownTypeAliasesRule,
};
