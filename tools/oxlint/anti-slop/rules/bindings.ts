import type { ESTree, Reference } from "@oxlint/plugins";

import type { Binding, Identifier, Syntax } from "./syntax.ts";

interface LexicalScope {
	readonly references: readonly Syntax<
		Pick<Reference, "identifier" | "resolved">
	>[];
}

interface RuleSource {
	readonly text: string;
	readonly scopeManager: { readonly scopes: readonly LexicalScope[] };
}

/** Native scope references already resolve lexical shadowing for each identifier. */
function resolveLexicalVariable(
	scopes: readonly LexicalScope[],
	identifier: Identifier,
): Binding | null {
	for (const scope of scopes) {
		const reference = scope.references.find(
			(candidate) =>
				candidate.identifier.start === identifier.start &&
				candidate.identifier.end === identifier.end,
		);
		if (reference !== undefined) {
			return reference.resolved;
		}
	}
	return null;
}

function resolveVariable(
	source: RuleSource,
	identifier: Identifier,
): Binding | null {
	return resolveLexicalVariable(source.scopeManager.scopes, identifier);
}

function sourceText(
	source: Readonly<Pick<RuleSource, "text">>,
	node: Readonly<Pick<ESTree.Node, "start" | "end">>,
): string {
	return source.text.slice(node.start, node.end);
}

export { resolveLexicalVariable, resolveVariable, sourceText };
export type { RuleSource, LexicalScope };
