import { defineRule } from "@oxlint/plugins";
import type { ESTree } from "@oxlint/plugins";

import functionContractVisitors from "./function-contract-visitors.ts";
import type { FunctionContract } from "./function-contract-visitors.ts";
import lexicalTypeParameterNames from "./lexical-type-parameters.ts";
import { localTypeAliases } from "./local-type-aliases.ts";
import resolvesToObject from "./object-parameter-types.ts";
import type { Syntax } from "./syntax.ts";

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

function parameterName(
	parameter: Parameter,
	sourceCode: Readonly<{ text: string }>,
): string {
	return parameter.type === "Identifier"
		? parameter.name
		: sourceCode.text
				.slice(parameter.start, parameter.end)
				.replace(/\s*:\s*object\s*$/u, "");
}

/** Ban the broad object type on function inputs, including local aliases to object. */
const noObjectParametersRule = defineRule({
	createOnce(context) {
		const aliases = new Map<string, Syntax<ESTree.TSTypeAliasDeclaration>>();

		const checkParameters = (node: FunctionContract): void => {
			const shadowedAliases = lexicalTypeParameterNames(
				node,
				context.sourceCode.visitorKeys,
			);
			for (const parameter of node.params) {
				const annotation = parameterAnnotation(parameter);
				if (
					annotation !== null &&
					annotation !== undefined &&
					resolvesToObject(annotation.typeAnnotation, {
						aliases,
						shadowedAliases,
						visited: new Set(),
					})
				) {
					context.report({
						data: { parameter: parameterName(parameter, context.sourceCode) },
						messageId: "objectParameter",
						node: {
							range: [
								annotation.typeAnnotation.start,
								annotation.typeAnnotation.end,
							],
						},
					});
				}
			}
		};

		return {
			Program(node) {
				aliases.clear();
				for (const alias of localTypeAliases(node)) {
					if (
						alias.typeParameters === null ||
						alias.typeParameters === undefined
					) {
						aliases.set(alias.id.name, alias);
					}
				}
			},
			...functionContractVisitors(checkParameters),
		};
	},
	meta: {
		docs: {
			description:
				"Disallow object function parameters; inputs must use an owner-provided type and be parsed at their boundary.",
		},
		messages: {
			objectParameter:
				"Parameter `{{parameter}}` uses the broad `object` type. Accept a named owner type; parse external input at its boundary before calling this function.",
		},
		type: "problem",
	},
});

export { noObjectParametersRule as default };
