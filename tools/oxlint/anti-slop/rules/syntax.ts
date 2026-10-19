import type { ESTree, Variable } from "@oxlint/plugins";

/** The parser owns AST mutation; rule helpers only inspect its syntax. */
type Syntax<Value> = Value extends (
	...parameters: infer Arguments
) => infer Result
	? (...parameters: Arguments) => Result
	: Value extends readonly (infer Element)[]
		? readonly Syntax<Element>[]
		: Value extends object
			? { readonly [Key in keyof Value]: Syntax<Value[Key]> }
			: Value;

type Binding = Syntax<Variable>;
type Identifier = Readonly<
	Pick<ESTree.IdentifierReference, "name" | "start" | "end">
>;

export type { Syntax, Binding, Identifier };
