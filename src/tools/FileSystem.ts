// filesystem.ts

import fs from 'fs/promises';
import path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getLogger } from '../logger/logger.ts';
import { ToolRegistry } from './ToolRegistry.ts';
import { FILE_SYSTEM_SCHEMA } from '../llm.ts';
import { _FileSystemSchema } from '../prompts/schemas/FileSystemSchema.ts';

const logger = getLogger('FileSystem');

const execAsync = promisify(exec);

export const WORKSPACE_ROOT = '/agent_workspace';

export class PathError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PathError';
	}
}

export const resolvePath = (userPath: string): string => {
	// const full = path.resolve(WORKSPACE_ROOT, userPath);

	// if (!full.startsWith(WORKSPACE_ROOT)) {
	//     throw new PathError(`path: ${userPath} escaped workspace`);
	// }

	// return full;

	return userPath;
};

// -------------------
// TOOL FUNCTIONS
// -------------------

export const list_directory = async (dirPath: string): Promise<string[]> =>
	await fs.readdir(resolvePath(dirPath));

export const read_file = (filePath: string): Promise<string> => {
	return fs.readFile(resolvePath(filePath), 'utf8');
};

export const write_file = async (
	filePath: string,
	content: string,
): Promise<boolean> => {
	let success = false;
	try {
		await fs.writeFile(resolvePath(filePath), content, 'utf8');
		success = true;
	} catch (_) {}

	return success;
};

export const append_file = async (
	filePath: string,
	content: string,
): Promise<boolean> => {
	let success = false;

	try {
		await fs.appendFile(resolvePath(filePath), content, 'utf8');
		success = true;
	} catch (_) {}

	return success;
};

export const create_directory = async (dirPath: string): Promise<boolean> => {
	let success = false;

	try {
		await fs.mkdir(resolvePath(dirPath), { recursive: true });
		success = true;
	} catch (_) {}

	return success;
};

export const move_file = async (src: string, dst: string): Promise<boolean> => {
	let success = false;

	try {
		await fs.rename(resolvePath(src), resolvePath(dst));
		success = true;
	} catch (_) {}

	return success;
};

export const copy_file = async (src: string, dst: string): Promise<boolean> => {
	let success = false;

	try {
		await fs.copyFile(resolvePath(src), resolvePath(dst));
		success = true;
	} catch (_) {}

	return success;
};

export const delete_file = async (filePath: string): Promise<boolean> => {
	let success = false;

	try {
		await fs.unlink(resolvePath(filePath));
		success = true;
	} catch (_) {}

	return success;
};

export const file_exists = async (filePath: string): Promise<boolean> => {
	try {
		const stat = await fs.stat(resolvePath(filePath));
		return stat.isFile();
	} catch {
		return false;
	}
};

export const currentWorkingDirectory = async (): Promise<string> =>
	process.cwd();

export interface ShellContext {
	input: string;
	output?: string;
	error?: string;
}

export const execute_shell = async (command: string): Promise<string> => {
	const shellContext: ShellContext = {
		input: command,
		output: undefined,
		error: undefined,
	};

	try {
		const { stdout, stderr } = await execAsync(command);
		shellContext.error = stderr;
		shellContext.output = stdout;
	} catch (e) {
		const msg = `something went wrong in executeShell ${JSON.stringify(e, null, 2)}`;
		if (!shellContext.error) shellContext.error = msg;
		logger.error(msg);
	}

	logger.debug(`shellContext: ${JSON.stringify(shellContext)}`);

	return JSON.stringify(shellContext);
};

export const search_files = async (
	directory: string,
	pattern = '*',
): Promise<string[]> => {
	const resolved = resolvePath(directory);

	const entries = await fs.readdir(resolved);

	const regex = new RegExp(
		'^' +
			pattern.replace(/\./g, '\\.').replace(/\*/g, '.*').replace(/\?/g, '.') +
			'$',
	);

	const results: string[] = [];

	for (const entry of entries) {
		const fullPath = path.join(resolved, entry);

		const stat = await fs.stat(fullPath);

		if (stat.isFile() && regex.test(entry)) {
			results.push(entry);
		}
	}

	return results;
};

export function RegisterTools(registry: ToolRegistry) {
	registry.register({
		name: 'current_working_directory',
		func: currentWorkingDirectory,
		toolSchema: _FileSystemSchema.current_working_directory,
	});
	registry.register({
		name: 'list_directory',
		func: list_directory,
		toolSchema: _FileSystemSchema.list_directory,
	});
	registry.register({
		name: 'read_file',
		func: read_file,
		toolSchema: _FileSystemSchema.read_file,
	});
	registry.register({
		name: 'write_file',
		func: write_file,
		toolSchema: _FileSystemSchema.write_file,
	});
	registry.register({
		name: 'append_file',
		func: append_file,
		toolSchema: _FileSystemSchema.append_file,
	});
	registry.register({
		name: 'create_directory',
		func: create_directory,
		toolSchema: _FileSystemSchema.create_directory,
	});
	registry.register({
		name: 'move_file',
		func: move_file,
		toolSchema: _FileSystemSchema.move_file,
	});
	registry.register({
		name: 'copy_file',
		func: copy_file,
		toolSchema: _FileSystemSchema.copy_file,
	});
	registry.register({
		name: 'delete_file',
		func: delete_file,
		toolSchema: _FileSystemSchema.delete_file,
	});
	registry.register({
		name: 'file_exists',
		func: file_exists,
		toolSchema: _FileSystemSchema.file_exists,
	});
	registry.register({
		name: 'search_files',
		func: search_files,
		toolSchema: _FileSystemSchema.search_files,
	});
	registry.register({
		name: 'execute_shell',
		func: execute_shell,
		toolSchema: _FileSystemSchema.execute_shell,
	});
}
