import { describe, expect, it } from "bun:test";

import { z } from "zod";

import {
	recordFileText,
	scopedRecordParser,
	scopedRecordReader,
	withRecordReadScope,
} from "./record-read-scope";
import RecordReadWorkspace from "./record-read-workspace-test-fixture";
import { TestResources } from "./test-support";

const CALL_COUNT_INCREMENT = 1;

const workspace = new RecordReadWorkspace(TestResources.forEachTest());

const withRecordReadScopeStartsASharedPendingReadImmediatelyAndPreservesItsResolvedValue =
	async (): Promise<void> => {
		const record = { id: "record" };
		const pending = Promise.withResolvers<typeof record>();
		const calls: string[] = [];
		const read = scopedRecordReader(async (path) => {
			calls.push(path);
			return await pending.promise;
		});

		await withRecordReadScope(async () => {
			const first = read("record.json");
			const second = read("record.json");
			expect(calls).toEqual(["record.json"]);
			pending.resolve(record);

			const values = await Promise.all([first, second]);
			const [observedFirstValue, observedSecondValue] = values;

			expect(observedFirstValue).toBe(record);
			expect(observedSecondValue).toBe(record);
		});

		expect(await read("record.json")).toBe(record);
		expect(calls).toEqual(["record.json", "record.json"]);
	};

const withRecordReadScopeRejectsWhenAnInjectedReaderThrowsBeforeReturningItsPromise =
	async (): Promise<void> => {
		const expectedCalls = 1;

		const failure = new Error("reader failed synchronously");
		let calls = 0;
		const read = scopedRecordReader<string>(() => {
			calls += CALL_COUNT_INCREMENT;
			throw failure;
		});

		const reading = read("record.json");

		expect(calls).toBe(expectedCalls);
		expect(reading).rejects.toBe(failure);
		await Promise.allSettled([reading]);
	};

const withRecordReadScopeReusesParsedJSONWithinAReportAndReadsReplacementJSONInTheNextReport =
	async (): Promise<void> => {
		const rowsSchema = z.array(z.string());
		const readRecord = scopedRecordParser(
			z.object({
				rows: rowsSchema,
			}),
		);
		const file = await workspace.file(
			"rehearse-record-json-",
			JSON.stringify({ rows: ["before"] }),
		);

		const [original, repeated] = await withRecordReadScope(async () => {
			const initial = await readRecord(file);
			await Bun.write(file, JSON.stringify({ rows: ["after"] }));

			return [initial, await readRecord(file)] as const;
		});
		const next = await withRecordReadScope(async () => await readRecord(file));

		expect(repeated).toBe(original);
		expect(repeated).toEqual({
			data: { rows: ["before"] },
			success: true,
		});
		expect(next).toEqual({ data: { rows: ["after"] }, success: true });
	};

const withRecordReadScopeLetsDistinctTypedReadersValidateTheSameReportsOriginalBytes =
	async (): Promise<void> => {
		const readStopped = scopedRecordParser(
			z.object({ status: z.literal("STOPPED") }),
		);
		const readAwaiting = scopedRecordParser(
			z.object({ status: z.literal("AWAITING") }),
		);
		const file = await workspace.file(
			"rehearse-record-contracts-",
			JSON.stringify({ status: "STOPPED" }),
		);

		const [stopped, awaiting] = await withRecordReadScope(async () => {
			const initial = await readStopped(file);
			await Bun.write(file, JSON.stringify({ status: "AWAITING" }));

			return [initial, await readAwaiting(file)] as const;
		});
		const next = await withRecordReadScope(
			async () => await readAwaiting(file),
		);

		expect(stopped).toEqual({ data: { status: "STOPPED" }, success: true });
		expect(awaiting.success).toBe(false);
		expect(next).toEqual({ data: { status: "AWAITING" }, success: true });
	};

const withRecordReadScopeReusesAReadingInsideAReportAndSeesReplacementBytesInTheNextReport =
	async (): Promise<void> => {
		const file = await workspace.file("rehearse-record-reads-", "before");

		const repeated = await withRecordReadScope(async () => {
			await recordFileText(file);
			await Bun.write(file, "after");

			return await withRecordReadScope(async () => await recordFileText(file));
		});
		const next = await withRecordReadScope(
			async () => await recordFileText(file),
		);

		expect(repeated).toBe("before");
		expect(next).toBe("after");
	};

describe(withRecordReadScope.name, () => {
	it(
		"starts a shared pending read immediately and preserves its resolved value",
		withRecordReadScopeStartsASharedPendingReadImmediatelyAndPreservesItsResolvedValue,
	);

	it(
		"rejects when an injected reader throws before returning its promise",
		withRecordReadScopeRejectsWhenAnInjectedReaderThrowsBeforeReturningItsPromise,
	);

	it(
		"reuses parsed JSON within a report and reads replacement JSON in the next report",
		withRecordReadScopeReusesParsedJSONWithinAReportAndReadsReplacementJSONInTheNextReport,
	);

	it(
		"lets distinct typed readers validate the same report's original bytes",
		withRecordReadScopeLetsDistinctTypedReadersValidateTheSameReportsOriginalBytes,
	);

	it(
		"reuses a reading inside a report and sees replacement bytes in the next report",
		withRecordReadScopeReusesAReadingInsideAReportAndSeesReplacementBytesInTheNextReport,
	);
});
