import { describe, expect, it } from "bun:test";
import { setImmediate } from "node:timers/promises";

import concurrentMap from "./concurrent-map";

const SECOND_TASK_RESULT = 2;
const FIRST_TASK_RESULT = 1;

const STARTED_OPERATION_COUNT_INCREMENT = 1;

const concurrentMapPreservesInputOrderWhenALaterReadingFinishesFirst =
	async (): Promise<void> => {
		const expectedEarlierInputResult = 1;
		const expectedLaterInputResult = 2;

		const first = Promise.withResolvers<number>();
		const second = Promise.resolve(SECOND_TASK_RESULT);
		const reading = concurrentMap(
			[first.promise, second],
			async (value) => await value,
		);
		await second;
		first.resolve(FIRST_TASK_RESULT);

		expect(await reading).toEqual([
			expectedEarlierInputResult,
			expectedLaterInputResult,
		]);
	};

const concurrentMapBoundsPendingWorkWhileReadingTheWholeCollection =
	async (): Promise<void> => {
		const expectedStarted = 16;

		const gate = Promise.withResolvers<undefined>();
		let started = 0;
		const reading = concurrentMap(
			Array.from({ length: 40 }, (_value, index) => index),
			async (value) => {
				started += STARTED_OPERATION_COUNT_INCREMENT;
				await gate.promise;
				return value;
			},
		);

		expect(started).toBe(expectedStarted);
		gate.resolve();
		expect(await reading).toEqual(
			Array.from({ length: 40 }, (_value, index) => index),
		);
	};

const concurrentMapAnswersAnEmptyCollectionWithoutReadingAnything =
	async (): Promise<void> => {
		expect(
			await concurrentMap([], async (value) => await Promise.resolve(value)),
		).toEqual([]);
	};

const concurrentMapWaitsForPendingReadersBeforeRejectingAFailedCollection =
	async (): Promise<void> => {
		const gate = Promise.withResolvers<number>();
		const failure = new Error("unreadable record");
		const reading = concurrentMap(
			[Promise.reject(failure), gate.promise],
			async (value) => await value,
		);
		const settled = Promise.allSettled([reading]);

		const settledBeforeRelease = await Promise.race([
			settled,
			setImmediate(false),
		]);
		gate.resolve(SECOND_TASK_RESULT);

		expect(settledBeforeRelease).toBe(false);
		expect(await settled).toEqual([{ reason: failure, status: "rejected" }]);
	};

describe(concurrentMap.name, () => {
	it(
		"preserves input order when a later reading finishes first",
		concurrentMapPreservesInputOrderWhenALaterReadingFinishesFirst,
	);

	it(
		"bounds pending work while reading the whole collection",
		concurrentMapBoundsPendingWorkWhileReadingTheWholeCollection,
	);

	it(
		"answers an empty collection without reading anything",
		concurrentMapAnswersAnEmptyCollectionWithoutReadingAnything,
	);

	it(
		"waits for pending readers before rejecting a failed collection",
		concurrentMapWaitsForPendingReadersBeforeRejectingAFailedCollection,
	);
});
