import { getLogger } from '../logger/logger.ts';

const logger = getLogger('ToolRegistry');

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type _func = (...args: any[]) => Promise<any>;

export type ToolSchema = {
	name: string, path: string
}
export type ToolEntry = {
	readonly name: string;
	readonly func: _func;
	readonly schema: ToolSchema;
};

export class ToolRegistry {
	public readonly _tools: Map<string, ToolEntry> = new Map<string, ToolEntry>();

	public register({name, func, toolSchema}:{name: string, func: _func, toolSchema: ToolSchema}) 
	{
		if (this._tools.has(name))
			throw new Error(`Tool '${name}' is already registered`);

		try {
			logger.debug(
				`registering tool name: ${name}, functype: ${typeof func}, func: ${func}, schema: ${JSON.stringify(toolSchema,null,2)}`,
			);

			const tool: ToolEntry = {
				name,
				func,
				schema: toolSchema,
			};

			this._tools.set(name, tool);
			const sanityCheck = this._tools.get(name);

			logger.debug(`tool sanity check func: ${sanityCheck?.func}`);
		} catch (e) {
			logger.error(`something went wrong in ToolRegistry register: ${e}`);
		}
	}

	public getToolEntry(name: string): ToolEntry | undefined {
		return this._tools.get(name);
	}

	public listTools(): ToolEntry[] {
		const allTools: ToolEntry[] = [];

		for (const key of this._tools.keys()) {
			const tool = this._tools.get(key);
			if (tool) allTools.push(tool);
		}

		return allTools;
	}

	public listSchemas() {
		const schemas = new Map<string, ToolSchema>();

		for (const tool of this._tools.values()) 
			if (tool.schema) if (!schemas.get(tool.schema.name)) schemas.set(tool.schema.name, tool.schema);

		return schemas;
	}
}
