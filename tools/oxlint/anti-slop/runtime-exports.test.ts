import { describe, expect, it } from "bun:test";

import ruleDiagnostics from "./rule-test-support";

const namedRuntimeModules = [
	'const ready = "ready"; type State = string; export { ready as "*" }; export type { State };',
	"const ready = 'ready'; type State = string; export { ready }; export type { State };",
	"export default interface State { readonly value: string; } export const ready = 'ready';",
	"export * as entry from './entry'; export type State = string;",
	"export function ready(value: string): string; export function ready(value: string): string { return value; } export type State = string;",
	"export const { ready } = { ready: 'ready' }; export type State = string;",
	"const ready = 'ready'; type State = string; export { ready, type State };",
	"export const ready = 'ready'; export interface State { readonly value: string; }",
	"type State = string; export { run as ready } from './entry'; export type { State };",
];

const coherentRuntimeModules = [
	"export * from './entry'; export type State = string;",
	"const ready = 'ready'; type State = string; export { ready as default }; export type { State };",
	"const ready = 'ready'; const waiting = 'waiting'; type State = string; export { ready, waiting }; export type { State };",
	"type State = string; interface Reading { readonly value: State; } export type { State, Reading };",
	"export const { ready, waiting } = { ready: 'ready', waiting: 'waiting' };",
];

describe("runtime export policy", () => {
	it.each(coherentRuntimeModules)(
		"accepts coherent default, multiple-runtime and type-only modules: %s",
		async (source) => {
			const diagnostics = await ruleDiagnostics(source);

			expect(diagnostics).toEqual([]);
		},
	);

	describe("when a module has a sole named runtime entry", () => {
		it.each(namedRuntimeModules)(
			"rejects a sole named runtime entry alongside types: %s",
			async (source) => {
				const diagnostics = await ruleDiagnostics(source);

				expect(
					diagnostics.some(
						({ code }) =>
							code === "import(prefer-default-export)" ||
							code === "anti-slop(prefer-default-runtime-export)",
					),
				).toBe(true);
			},
		);
	});
});
