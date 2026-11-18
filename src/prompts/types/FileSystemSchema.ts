import { Tool } from './ApiToolChain.ts';

export const FileSystemSchema: Tool[] = [
	{
		name: 'current_working_directory',
		description: 'Get current working directory.',
		parameters: [],
		return: {
			name: 'Current working directory',
			type: 'string',
			value: 'String of current working directory name.',
			required: true,
		},
	},

	{
		name: 'list_directory',
		description: 'List files and directories inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value: 'Relative path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'entries',
			type: 'array<string>',
			value: 'List of files, as strings, from fs.readdir',
			required: true,
		},
	},

	{
		name: 'read_file',
		description: 'Read a UTF-8 text file inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value: 'Relative file path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'content',
			type: 'string',
			value: 'Contains file content in UTF-8 format.',
			required: true,
		},
	},

	{
		name: 'write_file',
		description: 'Write UTF-8 text content to a file inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value: 'Relative file path inside the workspace root.',
				required: true,
			},
			{
				name: 'content',
				type: 'string',
				value: 'UTF-8 text content to write.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'boolean',
			value: 'Contains success status of written file.',
			required: true,
		},
	},

	{
		name: 'append_file',
		description: 'Append UTF-8 text content to a file inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value: 'Relative file path inside the workspace root.',
				required: true,
			},
			{
				name: 'content',
				type: 'string',
				value: 'UTF-8 text content to append.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'boolean',
			value: 'Contains success status of file append.',
			required: true,
		},
	},

	{
		name: 'create_directory',
		description: 'Create a directory inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value: 'Relative directory path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'boolean',
			value: 'Contains success status of directory creation.',
			required: true,
		},
	},

	{
		name: 'move_file',
		description: 'Move or rename a file.',
		parameters: [
			{
				name: 'src',
				type: 'string',
				value: 'Source file path.',
				required: true,
			},
			{
				name: 'dst',
				type: 'string',
				value: 'Destination file path.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'boolean',
			value: 'Contains success status of file move.',
			required: true,
		},
	},

	{
		name: 'copy_file',
		description: 'Copy a file inside the workspace.',
		parameters: [
			{
				name: 'src',
				type: 'string',
				value: 'Source file path inside the workspace.',
				required: true,
			},
			{
				name: 'dst',
				type: 'string',
				value: 'Destination file path inside the workspace.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'boolean',
			value: 'Contains success status of file copy.',
			required: true,
		},
	},

	{
		name: 'delete_file',
		description: 'Delete a file inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value: 'Relative file path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'boolean',
			value: 'Contains success status.',
			required: true,
		},
	},

	{
		name: 'file_exists',
		description:
			'Check whether a file or directory exists inside the workspace.',
		parameters: [
			{
				name: 'path',
				type: 'string',
				value: 'Relative path inside the workspace root.',
				required: true,
			},
		],
		return: {
			name: 'exists',
			type: 'boolean',
			value: 'Whether the file or directory exists.',
			required: true,
		},
	},

	{
		name: 'execute_shell',
		description: 'Execute command with system shell.',
		parameters: [
			{
				name: 'command',
				type: 'string',
				value: 'Shell command to execute.',
				required: true,
			},
		],
		return: {
			name: 'result',
			type: 'object',
			value: 'Contains input, output, and error as string members.',
			required: true,
		},
	},

	{
		name: 'search_files',
		description: 'Search for files inside the workspace by filename pattern.',
		parameters: [
			{
				name: 'directory',
				type: 'string',
				value: 'Directory path to search inside.',
				required: true,
			},
			{
				name: 'pattern',
				type: 'string',
				value: "Filename pattern such as '*.py'.",
				required: false,
			},
		],
		return: {
			name: 'matches',
			type: 'array<string>',
			value: 'List of matching file paths.',
			required: true,
		},
	},
];
