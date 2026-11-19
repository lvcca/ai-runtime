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
export type OllamaResponse = { response: string };

const OLLAMA_URL = _env.ollama_url;

export const call_LLM = async (
	prompt: string,
	model: LLM_MODEL = LLM_MODEL.QWEN3_CODER,
) => {
	try {
		logger.info(`calling llm ${prompt}`);

		const karpathy_guidelines = `${PROMPTS['karpathy_guidelines']} + '\n'`;

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

		if (!response.ok) {
			const errorText = await response.text();
			throw new Error(
				`response unsuccessful: ${response.status}, errorText: ${errorText}`,
			);
		}

		const _response = (await response.json()) as OllamaResponse;

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

// types
const TOOL_API_TYPE_FILE = './prompts/types/ApiToolChain.d.ts';
const SHELL_EXECUTOR_TYPE_FILE = './prompts/types/ShellExecutor.d.ts';
const SHELL_BRANCH_ANALYSIS_TYPE_FILE = './prompts/types/ShellBranch.d.ts';
const SHELL_RESULTS_TYPE_FILE = './prompts/types/ShellResults.d.ts';
const TASK_RESULTS_VALIDATOR_TYPES = './prompts/types/TaskValidator.d.ts';

// schemas
export const FILE_SYSTEM_SCHEMA = './prompts/types/FileSystemSchema.ts';

export const PROMPTS = {
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

export type PROMPTS = (typeof PROMPTS)[keyof typeof PROMPTS];

export const call_llm_chat = async (prompt: string) => {
	const withContext = PROMPTS['chat'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_tasks = async (prompt: string) => {
	const withContext = PROMPTS['tasks'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_toolcall = async (prompt: string) => {
	const withContext = PROMPTS['execution'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_data_narrower = async (prompt: string) => {
	const withContext = PROMPTS['tool_narrower'] + PROMPTS['tool_types'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_shell_executor = async (prompt: string) => {
	const withContext = PROMPTS['shell_executor'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_shell_results_analyzer = async (prompt: string) => {
	const withContext = PROMPTS['shell_results_analyzer'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_shell_branch_analyzer = async (prompt: string) => {
	const withContext =
		PROMPTS['shell_executor_branch_analyst'] +
		PROMPTS['shell_executor_branch_analysis_types'] +
		prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_shell_branch_simplifier = async (prompt: string) => {
	const withContext = PROMPTS['shell_executor_branch_analyst'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_task_validator = async (prompt: string) => {
	const withContext = PROMPTS['task_result_validator'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_task_result_junction_manager = async (prompt: string) => {
	const withContext = PROMPTS['task_result_junction_manager'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_task_summarizer = async (prompt: string) => {
	const withContext = PROMPTS['task_result_summarizer'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};

export const call_llm_task_transaction_manager = async (prompt: string) => {
	const withContext = PROMPTS['task_transaction_manager'] + prompt;
	const res = await call_LLM(withContext);
	if (!res) throw new Error(`did not receive response from llm: ${res}`);

	return res;
};
