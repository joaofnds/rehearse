interface FileInputProps {
	readonly id: string;
	readonly accept: string;
	readonly onChoose: (file: File) => void;
}

function FileInput({
	id,
	accept,
	onChoose,
}: FileInputProps): React.JSX.Element {
	return (
		<input
			id={id}
			type="file"
			accept={accept}
			onChange={(event) => {
				const [file] = event.target.files ?? [];
				if (file !== undefined) {
					onChoose(file);
				}
			}}
			className="min-h-touch-target min-w-0 w-full max-w-full rounded-md border border-strong bg-background text-14 file:mr-3 file:min-h-touch-target file:border-0 file:border-r file:border-strong file:bg-raised file:px-3 file:font-medium file:text-foreground hover:file:bg-accent focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-3"
		/>
	);
}

export { FileInput as default };
