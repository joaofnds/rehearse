import { describe, expectTypeOf, it } from "bun:test";

import type { Immutable } from "#benchmark/contracts";
import type { CalibrateRequest } from "#cli/calibrate-command";

type Reading = (run: string) => Promise<number>;

type Identity = <Value>(value: Value) => Value;

interface Converter {
	(value: string): number;
	(value: number): string;
}

interface CachedReading {
	(run: string): Promise<number>;
	cache: { values: string[] };
}

interface ReadRequest {
	readonly read: Reading;
}

describe("recursive immutable contracts", () => {
	it("retains ordinary callback signatures", () => {
		expectTypeOf<Immutable<Reading>>().toEqualTypeOf<Reading>();
	});

	it("retains generic input and output correlation", () => {
		expectTypeOf<Immutable<Identity>>().toEqualTypeOf<Identity>();
	});

	it("retains overloaded callback signatures", () => {
		expectTypeOf<Immutable<Converter>>().toEqualTypeOf<Converter>();
	});

	it("keeps canonical partial requests assignable with their callbacks", () => {
		expectTypeOf<Immutable<Partial<CalibrateRequest>>>().toEqualTypeOf<
			Readonly<Partial<CalibrateRequest>>
		>();
	});

	it("protects nested data properties", () => {
		expectTypeOf<Immutable<{ child: { enabled: boolean } }>>().toEqualTypeOf<{
			readonly child: { readonly enabled: boolean };
		}>();
	});

	it("protects arrays and their element properties", () => {
		expectTypeOf<Immutable<{ enabled: boolean }[]>>().toEqualTypeOf<
			readonly { readonly enabled: boolean }[]
		>();
	});

	describe("when a callable owns data", () => {
		it("retains the readonly view of its properties and arrays", () => {
			expectTypeOf<Immutable<CachedReading>>().toEqualTypeOf<{
				readonly cache: { readonly values: readonly string[] };
			}>();
		});
	});

	describe("when a request supplies a non-callable reader", () => {
		it("rejects the incompatible request", () => {
			expectTypeOf<{ readonly read: number }>().not.toExtend<
				Immutable<Partial<ReadRequest>>
			>();
		});
	});
});
