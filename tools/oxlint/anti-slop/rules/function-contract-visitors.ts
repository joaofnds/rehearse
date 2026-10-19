import type { ESTree, Visitor } from "@oxlint/plugins";

import type { Syntax } from "./syntax.ts";

type FunctionContract =
	| Syntax<ESTree.ArrowFunctionExpression>
	| Syntax<ESTree.Function>
	| Syntax<ESTree.TSCallSignatureDeclaration>
	| Syntax<ESTree.TSConstructSignatureDeclaration>
	| Syntax<ESTree.TSConstructorType>
	| Syntax<ESTree.TSFunctionType>
	| Syntax<ESTree.TSMethodSignature>;

function functionContractVisitors(
	check: (node: FunctionContract) => void,
): Visitor {
	return {
		ArrowFunctionExpression(node) {
			check(node);
		},
		FunctionDeclaration(node) {
			check(node);
		},
		FunctionExpression(node) {
			check(node);
		},
		TSCallSignatureDeclaration(node) {
			check(node);
		},
		TSConstructSignatureDeclaration(node) {
			check(node);
		},
		TSConstructorType(node) {
			check(node);
		},
		TSDeclareFunction(node) {
			check(node);
		},
		TSEmptyBodyFunctionExpression(node) {
			check(node);
		},
		TSFunctionType(node) {
			check(node);
		},
		TSMethodSignature(node) {
			check(node);
		},
	};
}

export { functionContractVisitors as default };
export type { FunctionContract };
