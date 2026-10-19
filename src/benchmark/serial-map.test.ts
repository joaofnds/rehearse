import { describe, expect, it } from "bun:test";

import serialMap from "./serial-map";
import ControlledSerialSource from "./serial-source-test-fixture";

const EXPECTED_INITIAL_SOURCE_VALUE = 1;

const FIRST_MAPPED_RESULT = 1;

const serialMapStartsOneReadOnDemandAndLeavesTheNextItemForItsConsumer =
	async (): Promise<void> => {
		const gate = Promise.withResolvers<number>();
		const source = new ControlledSerialSource({ gate: gate.promise });

		const reading = serialMap(source.inputs(), source.read);

		expect(source.started).toEqual([]);
		const first = reading.next();
		expect(source.started).toEqual([EXPECTED_INITIAL_SOURCE_VALUE]);
		gate.resolve(FIRST_MAPPED_RESULT);
		expect(await first).toEqual({ done: false, value: 1 });
		expect(source.started).toEqual([EXPECTED_INITIAL_SOURCE_VALUE]);
	};

const serialMapConsumesSuccessorsOnlyAfterThePendingRead =
	async (): Promise<void> => {
		const gate = Promise.withResolvers<number>();
		const source = new ControlledSerialSource({ gate: gate.promise });

		const reading = serialMap(source.inputs(), source.read);
		const first = reading.next();
		gate.resolve(FIRST_MAPPED_RESULT);
		await first;

		expect(await reading.next()).toEqual({ done: false, value: 2 });
		expect(await reading.next()).toEqual({ done: true, value: undefined });
	};

const serialMapClosesItsSourceWhenAConsumerStopsBeforeTheNextRead =
	async (): Promise<void> => {
		const source = new ControlledSerialSource();

		const reading = serialMap(source.inputs(), source.read);

		for await (const input of reading) {
			const expectedInput = 1;

			expect(input).toBe(expectedInput);
			break;
		}

		expect(source.started).toEqual([EXPECTED_INITIAL_SOURCE_VALUE]);
		expect(source.closed).toBe(true);
	};

const serialMapPropagatesAFailedReadAndClosesWithoutReadingAnotherItem =
	async (): Promise<void> => {
		const failure = new Error("unreadable first input");
		const source = new ControlledSerialSource({ failure });

		const reading = serialMap(source.inputs(), source.read);

		const [outcome] = await Promise.allSettled([reading.next()]);

		expect(outcome?.status).toBe("rejected");
		if (outcome?.status === "rejected") {
			expect(outcome.reason).toBe(failure);
		}
		expect(source.started).toEqual([EXPECTED_INITIAL_SOURCE_VALUE]);
		expect(source.closed).toBe(true);
		expect(await reading.next()).toEqual({ done: true, value: undefined });
	};

describe(serialMap.name, () => {
	it(
		"consumes successors only after the pending read",
		serialMapConsumesSuccessorsOnlyAfterThePendingRead,
	);
	it(
		"starts one read on demand and leaves the next item for its consumer",
		serialMapStartsOneReadOnDemandAndLeavesTheNextItemForItsConsumer,
	);

	it(
		"closes its source when a consumer stops before the next read",
		serialMapClosesItsSourceWhenAConsumerStopsBeforeTheNextRead,
	);

	it(
		"propagates a failed read and closes without reading another item",
		serialMapPropagatesAFailedReadAndClosesWithoutReadingAnotherItem,
	);
});
