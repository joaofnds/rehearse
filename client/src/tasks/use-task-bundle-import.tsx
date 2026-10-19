import type { UseMutationResult } from "@tanstack/react-query";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";

import casesQuery from "#client/cases/cases-query";
import { LAUNCH_CASES_QUERY_KEY } from "#client/launch/launch-dialog";

import pipelinesQuery from "./pipelines-query";
import type {
	BundlePreview,
	ImportDraft,
	ImportRequest,
} from "./task-bundle-api";
import { importBundle, previewBundle } from "./task-bundle-api";

interface ImportFormProps {
	readonly onImported: (path: string) => void;
}

interface BundleImportModel {
	readonly fileId: string;
	readonly bundleText: string | undefined;
	readonly draft: ImportDraft;
	readonly preview: UseMutationResult<BundlePreview, Error, string>;
	readonly imported: UseMutationResult<string, Error, ImportRequest>;
	readonly edit: (change: Partial<ImportDraft>) => void;
	readonly refusal: Error | null;
	readonly readBundle: (file: Readonly<Blob>) => Promise<void>;
}

function useBundleImport(
	onImported: ImportFormProps["onImported"],
): BundleImportModel {
	const fileId = useId();
	const [bundleText, setBundleText] = useState<string>();
	const [draft, setDraft] = useState<ImportDraft>({
		id: "",
		targetPath: "",
		title: "",
	});
	const preview = useMutation({
		mutationFn: previewBundle,
		onSuccess: (read) => {
			setDraft({
				id: read.caseId,
				targetPath: read.targetPath,
				title: read.title,
			});
		},
	});
	const imported = useBundlePersistence(onImported);

	const edit = (change: Partial<ImportDraft>): void => {
		setDraft((current) => ({ ...current, ...change }));
	};
	const refusal = preview.error ?? imported.error;
	const readBundle = async (file: Readonly<Blob>): Promise<void> => {
		const text = await file.text();
		setBundleText(text);
		preview.mutate(text);
	};

	return {
		bundleText,
		draft,
		edit,
		fileId,
		imported,
		preview,
		readBundle,
		refusal,
	};
}

function useBundlePersistence(
	onImported: ImportFormProps["onImported"],
): UseMutationResult<string, Error, ImportRequest> {
	const queryClient = useQueryClient();
	const imported = useMutation({
		mutationFn: importBundle,
		onSuccess: async (path) => {
			onImported(path);
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: pipelinesQuery.queryKey }),
				queryClient.invalidateQueries({ queryKey: casesQuery.queryKey }),
				queryClient.invalidateQueries({ queryKey: LAUNCH_CASES_QUERY_KEY }),
			]);
		},
	});
	return imported;
}

export { useBundleImport as default };
export type { BundleImportModel, ImportFormProps };
