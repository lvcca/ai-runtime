import { getLogger } from '../logger/logger.ts';
import type { Tool } from '../prompts/types/ApiToolChain.js';

const logger = getLogger('ToolRegistry');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type _func = (...args: any[]) => Promise<any>;

export type RegisteredToolEntry = {
	readonly name: string;
	readonly func: _func;
	readonly schema: Tool;
};

/**
 * Singleton tool repository class
 * @class
 */
export class ToolRegistry {
	private readonly _tools: Map<string, RegisteredToolEntry> = new Map<
		string,
		RegisteredToolEntry
	>();

	/**
	 * Registers a tool in the registry.
	 *
	 * @example
	 * const registry = new ToolRegistry();
	 *
	 * registry.register({
	 *     name: 'hello_world',
	 *     func: () => {
	 *         return 'henlo world!';
	 *     },
	 *     toolSchema: {
	 *         name: 'hello_world',
	 *         description: 'Returns a hello world string.',
	 *         parameters: [],
	 *         return: {
	 *             name: 'static string',
	 *             type: 'string',
	 *             value: 'value of hello world.',
	 *             required: true,
	 *         },
	 *     } as Tool,
	 * });
	 *
	 * @param name 			- tool name
	 * @param func 			- tool definition, machine's function def
	 * @param toolSchema 	- Tool schema, machine's type def
	 * @param sanityCheck 	- run a sanity test post registration
	 * @param overwrite 	- overwrite existing entries with the same name
	 * @method
	 */

	public register({
		name,
		func,
		toolSchema,
		sanityCheck = false,
		overwrite = false,
		verbose = false,
	}: {
		name: string;
		func: _func;
		toolSchema: Tool;
		sanityCheck?: boolean;
		overwrite?: boolean;
		verbose?: boolean;
	}) {
		if (this._tools.has(name) && !overwrite)
			throw new Error(`Tool '${name}' is already registered`);

		try {
			if (verbose)
				logger.debug(
					`registering tool name: ${name}, functype: ${typeof func}, func: ${func}, schema: ${JSON.stringify(toolSchema, null, 2)}`,
				);

			const tool: RegisteredToolEntry = {
				name,
				func,
				schema: toolSchema,
			};

			this._tools.set(name, tool);

			if (sanityCheck) {
				const _sanityCheck = this._tools.get(name);
				logger.debug(`tool sanity check func: ${_sanityCheck?.func}`);
			}
		} catch (e) {
			logger.error(`something went wrong in ToolRegistry register: ${e}`);
		}
	}

	/**
	 * Get tool collection, safe copy
	 * not intended for inserts or mutations, just for auditing or printing
	 * @returns {<string, RegisteredToolEntry>} Registry's _tools
	 */
	public getAllTools(): ReadonlyMap<string, RegisteredToolEntry> {
		return this._tools;
	}

	/**
	 * 	basic tool get
	 * 	@returns {RegisteredToolEntry}
	 */
	public getRegisteredToolEntry(name: string): RegisteredToolEntry {
		const _entry = this._tools.get(name);
		if (_entry) return _entry;
		else
			throw new Error(
				`[*] TOOL NOT FOUND! Tool with name ${name} not found in registry...`,
			);
	}

	/**
	 * 	tool get all
	 * 	@returns {RegisteredToolEntry[]}
	 */
	public listRegisteredTools(): RegisteredToolEntry[] {
		return Array.from(this._tools.values());
	}

	/**
	 * 	list schemas available
	 * 	@returns {Map<string, string>} map of tool schema name to tool schema
	 */
	public listSchemas(): Map<string, string> {
		// SchemaName<functionName, Tool>
		const schemas = new Map<string, string>();

		for (const tool of this._tools.values()) {
			if (tool.schema) {
				if (!schemas.get(tool.schema.name)) {
					schemas.set(tool.schema.name, JSON.stringify(tool.schema));
				}
			}
		}

		return schemas;
	}
}

export const toolRegistry = new ToolRegistry();

// future stuffs
// abstract class ToolBaseClass {
// 	protected readonly name: string;
// 	protected readonly registry: ToolRegistry;

// 	constructor(name: string, registry: ToolRegistry) {
// 		this.name = name;
// 		this.registry = registry;
// 	}
// 	//
// 	abstract SetToolSchema(Tools: Map<string, Tool>): Promise<void>;
// 	abstract GetToolSchema(): Promise<Map<string, Tool>>;
// 	//
// 	//
// 	public async registerTools(): Promise<void> {}
// }
//
