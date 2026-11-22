import { fileURLToPath } from 'node:url';
import { _env } from './env.ts';
import { getLogger } from './logger/logger.ts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const logger = getLogger('llm');

const LLM_MODEL = {
	LLAMA_3_1: 'llama3.1',
	QWEN3_CODER: 'qwen3-coder:latest',
	GRANITE_4: 'granite4.1:3b',
};

export type LLM_MODEL = (typeof LLM_MODEL)[keyof typeof LLM_MODEL];
export type OllamaCallResponse = { response: string };

const OLLAMA_URL = _env.ollamaBaseURL;

export const ollamaPull = async (model: string) => {
	const response = await fetch(`${OLLAMA_URL}/api/pull`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			name: model,
			stream: false,
		}),
	});
	assert(response.ok, `ollamaPull unsuccessful: ${response.status}.`)
	return response.json();
};

export const ollamaPs = async () => {
	const response = await fetch(`${OLLAMA_URL}/api/ps`, { method: 'GET' });
	assert(response.ok, `ollamaPs unsuccessful: ${response.status}.`)
	return response.json();
};

export const ollamaTags = async () => {
	const response = await fetch(`${OLLAMA_URL}/api/tags`, { method: 'GET' });
	assert(response.ok, `ollamaTags unsuccessful: ${response.status}.`)
	return response.json();
};

export const ollamaShow = async ({
	model,
	verbose = false,
}: {
	model: string;
	verbose: boolean;
}) => {
	const response = await fetch(`${OLLAMA_URL}/api/tags`, {
		method: 'POST',
		body: JSON.stringify({
			name: model,
			verbose: verbose,
		}),
	});
	assert(response.ok, `ollamaShow unsuccessful: ${response.status}.`)
	return response.json();
};

export const ollamaGenerate = async (
	prompt: string,
	model: LLM_MODEL = LLM_MODEL.QWEN3_CODER,
) => {
	try {
		logger.info(`calling llm ${prompt}`);

		const karpathy_guidelines = `${CONTEXTS['karpathy_guidelines']} + '\n'`;

		const response = await fetch(`${OLLAMA_URL}/api/generate`, {
			body: JSON.stringify({
				model,
				prompt: `${karpathy_guidelines} ${prompt}`,
				stream: false,
			}),
			headers: {
				'Content-Type': 'application/json',
			},
			method: 'POST',
		});
		assert(response.ok, `ollamaShow unsuccessful: ${response.status}.`)
		const _response = (await response.json()) as OllamaCallResponse;

		return _response.response;
	} catch (e) {
		logger.error(`something went wrong in call_llm: ${JSON.stringify(e)}`);
	}
};

const load_context = async ({
	prompts_md_file,
	verbose,
}: {
	prompts_md_file: string;
	verbose?: boolean;
}) => {
	let PROMPTS_CONTENT = '\n\n-----BEGIN CONTEXT-----\n\n';
	const CONTEXT_END = '\n\n-----END CONTEXT-----\n\n';

	if (verbose) logger.debug(`prompts_md_file: ${prompts_md_file}`);

	try {
		const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
		const appDistDir = path.resolve(currentDirectory, '../dist/');
		const filePath = path.join(appDistDir, prompts_md_file);
		const file_string = await readFile(filePath, 'utf8');

		if (verbose) logger.debug(`file_string: ${file_string}`);

		PROMPTS_CONTENT += file_string;
		PROMPTS_CONTENT += CONTEXT_END;
	} catch (e) {
		logger.error(`something went wrong in load_context ${e}`);
	}

	return PROMPTS_CONTENT;
};

export const getTypeFromFile = async ({
	file,
	verbose,
}: {
	file: string;
	verbose?: boolean;
}) => {

	let fileString: string | undefined;

	if (verbose) logger.debug(`desired file read: ${file}`);

	try {
		const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
		const appDistDir = path.resolve(currentDirectory, '../dist/prompts/types/');
		const filePath = path.join(appDistDir, file);
		fileString = await readFile(filePath, 'utf8');
		if (verbose) logger.debug(`file_string: ${fileString}`);
	} catch (e) {
		logger.error(`something went wrong in load_context ${e}`);
	}

	return fileString;
};

// prompts
const CODING_TASKS_PROMPTS_FILE = './prompts/coding_tasks_prompts.md';
const EXECUTION_PROMPTS_FILE = './prompts/execution_prompts.md';
const CHAT_PROMPTS_FILE = './prompts/chat_prompts.md';
const TOOL_NARROWER_PROMPTS_FILE = './prompts/tool_narrower.md';
const TASK_TRANSACTION_MANAGER = './prompts/task_transaction_manager.md';
const TASK_RESULTS_VALIDATOR = './prompts/task_validator.md';
const TASK_RESULTS_SUMMARIZER = './prompts/task_summarizer.md';
const SHELL_EXECUTOR_PROMPTS_FILE = './prompts/shell_executor_prompts.md';
const SHELL_EXECUTOR_BRANCH_PROMPTS_FILE =
	'./prompts/shell_executor_branch_prompts.md';
const SHELL_EXECUTOR_BRANCH_SIMPLIFIER_PROMPTS_FILE =
	'./prompts/shell_executor_branch_simplifier.md';
const SHELL_RESULTS_ANALYZER_PROMPTS_FILE =
	'./prompts/shell_results_analyzer_prompts.md';
const KARPATHY_GUIDELINES_PROMPTS_FILE =
	'./prompts/karpathy_guidelines_prompts.md';
const TASK_RESULT_JUNCTION_MANAGER = './prompts/junction_manager.md';

/**
 * types @TODO replace all type refs with calls to {@link getTypeFromFile}
 */
const TOOL_API_TYPE_FILE = './prompts/types/ApiToolChain.d.ts';
const SHELL_EXECUTOR_TYPE_FILE = './prompts/types/ShellExecutor.d.ts';
const SHELL_BRANCH_ANALYSIS_TYPE_FILE = './prompts/types/ShellBranch.d.ts';
const SHELL_RESULTS_TYPE_FILE = './prompts/types/ShellResults.d.ts';
const TASK_RESULTS_VALIDATOR_TYPES = './prompts/types/TaskValidator.d.ts';

// schemas
export const FILE_SYSTEM_SCHEMA = './prompts/schemas/FileSystemSchema.ts';

export const CONTEXTS = {
	tasks: await load_context({ prompts_md_file: CODING_TASKS_PROMPTS_FILE }),
	execution: await load_context({ prompts_md_file: EXECUTION_PROMPTS_FILE }),
	chat: await load_context({ prompts_md_file: CHAT_PROMPTS_FILE }),
	tool_narrower: await load_context({
		prompts_md_file: TOOL_NARROWER_PROMPTS_FILE,
	}),
	task_result_validator: await load_context({
		prompts_md_file: TASK_RESULTS_VALIDATOR,
	}),
	task_transaction_manager: await load_context({
		prompts_md_file: TASK_TRANSACTION_MANAGER,
	}),
	task_result_validator_type: await load_context({
		prompts_md_file: TASK_RESULTS_VALIDATOR_TYPES,
	}),
	task_result_junction_manager: await load_context({
		prompts_md_file: TASK_RESULT_JUNCTION_MANAGER,
	}),
	task_result_summarizer: await load_context({
		prompts_md_file: TASK_RESULTS_SUMMARIZER,
	}),
	// aux
	tool_types: await load_context({ prompts_md_file: TOOL_API_TYPE_FILE }),
	karpathy_guidelines: await load_context({
		prompts_md_file: KARPATHY_GUIDELINES_PROMPTS_FILE,
	}),
	// schemas
	file_system_schema: await load_context({
		prompts_md_file: FILE_SYSTEM_SCHEMA,
	}),
	// shell executor stuffs
	shell_executor: await load_context({
		prompts_md_file: SHELL_EXECUTOR_PROMPTS_FILE,
	}),
	shell_executor_types: await load_context({
		prompts_md_file: SHELL_EXECUTOR_TYPE_FILE,
	}),
	shell_executor_branch_analysis_types: await load_context({
		prompts_md_file: SHELL_BRANCH_ANALYSIS_TYPE_FILE,
	}),
	shell_executor_branch_analyst: await load_context({
		prompts_md_file: SHELL_EXECUTOR_BRANCH_PROMPTS_FILE,
	}),
	shell_executor_branch_simplifier: await load_context({
		prompts_md_file: SHELL_EXECUTOR_BRANCH_SIMPLIFIER_PROMPTS_FILE,
	}),
	// shell results
	shell_results_analyzer: await load_context({
		prompts_md_file: SHELL_RESULTS_ANALYZER_PROMPTS_FILE,
	}),
	shell_results_types: await load_context({
		prompts_md_file: SHELL_RESULTS_TYPE_FILE,
	}),
} as const;

export type CONTEXTS = (typeof CONTEXTS)[keyof typeof CONTEXTS];

export const llmQuery = async (
	{prompt, contexts} : {prompt: string, contexts: CONTEXTS | CONTEXTS[]}
) => {
	const _prompts = Array.isArray(contexts) ? structuredClone(contexts) : [contexts]
	_prompts.push(prompt)

	const withContext = _prompts.join(`\n`)
	const res = await ollamaGenerate(withContext);

	assert(res !== undefined, `did not receive response from llm: ${res}`)
	return res
}

export const llmChat = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.chat})

/**
 * used in {@link GetPlan} {@link RevisePlan} {@link runTask} {@link RunShellTask}
 * @param prompt
 * @returns
 */

export const llmTasks = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.tasks}) 

/**
 * used in {@link GetToolExecPayload}
 * @param prompt 
 * @returns 
 */

export const llmToolcall = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.execution})

/**
 * used in {@link ToolExec}
 * @param prompt 
 * @returns 
 */

export const llmDataNarrower = async (prompt: string) => llmQuery({prompt, contexts: [CONTEXTS.tool_narrower, CONTEXTS.tool_types]})

/**
 * unused
 * @param prompt 
 * @returns 
 */
export const llmShellExecutor = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.shell_executor})

/**
 * unused
 * @param prompt 
 * @returns 
 */
export const llmAnalyzeShellResults = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.shell_results_analyzer})

/**
 * used in {@link GetSecondOpinion} {@link AnalyzeShellResults}
 * @param prompt 
 * @returns 
 */
export const llmAnalyzeShellBranch = async (prompt: string) => llmQuery({prompt, contexts: [CONTEXTS.shell_executor_branch_analyst, CONTEXTS.shell_executor_branch_analysis_types]})

/**
 * used in {@link SimplifyOpinion}
 * @param prompt 
 * @returns 
 */

export const llmShellBranAnalystSimplifier = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.shell_executor_branch_analyst})

/**
 * used in {@link executionValidator}
 * @param prompt 
 * @returns 
 */

export const llmTaskValidator = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.task_result_validator})

/**
 * unused
 * @param prompt 
 * @returns 
 */

export const llmTaskResultJunctionManager = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.task_result_junction_manager})

/**
 * used in {@link summarizeExecTransaction}
 * @param prompt 
 * @returns 
 */

export const llmTaskSummarizer = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.task_result_summarizer})

/**
 * used in {@link manageExecutionResults}
 * @param prompt 
 * @returns 
 */

export const llmTaskTransactionManager = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.task_transaction_manager})
