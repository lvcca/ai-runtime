import { fileURLToPath } from 'node:url';
import { _env } from './env.ts';
import { getLogger } from './logger/logger.ts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { ollamaGenerate } from './ollama.ts';

const logger = getLogger('llm');

const loadContext = async ({
	promptsMdFile,
	verbose,
}: {
	promptsMdFile: string;
	verbose?: boolean;
}) => {
	let PROMPTS_CONTENT = '\n\n-----BEGIN CONTEXT-----\n\n';
	const CONTEXT_END = '\n\n-----END CONTEXT-----\n\n';

	if (verbose) logger.debug(`prompts_md_file: ${promptsMdFile}`);

	try {
		const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
		const appDistDir = path.resolve(currentDirectory, '../dist/');
		const filePath = path.join(appDistDir, promptsMdFile);
		const file_string = await readFile(filePath, 'utf8');

		if (verbose) logger.debug(`file_string: ${file_string}`);

		PROMPTS_CONTENT += file_string;
		PROMPTS_CONTENT += CONTEXT_END;
	} catch (e) {
		logger.error(`something went wrong in loadContext ${e}`);
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

export const useTypeFromFile = async ({file, typeName}:{file: string, typeName: string}) => `use ${typeName} from: {
		${await getTypeFromFile({file})}
	}
`

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
// const SHELL_BRANCH_ANALYSIS_TYPE_FILE = './prompts/types/ShellBranch.d.ts';
const SHELL_RESULTS_TYPE_FILE = './prompts/types/ShellResults.d.ts';
const TASK_RESULTS_VALIDATOR_TYPES = './prompts/types/TaskValidator.d.ts';

// schemas
export const FILE_SYSTEM_SCHEMA = './prompts/schemas/FileSystemSchema.ts';

export const CONTEXTS = {
	tasks: await loadContext({ promptsMdFile: CODING_TASKS_PROMPTS_FILE }),
	execution: await loadContext({ promptsMdFile: EXECUTION_PROMPTS_FILE }),
	chat: await loadContext({ promptsMdFile: CHAT_PROMPTS_FILE }),
	toolNarrower: await loadContext({
		promptsMdFile: TOOL_NARROWER_PROMPTS_FILE,
	}),
	taskResultValidator: await loadContext({
		promptsMdFile: TASK_RESULTS_VALIDATOR,
	}),
	taskTransactionManager: await loadContext({
		promptsMdFile: TASK_TRANSACTION_MANAGER,
	}),
	taskResultValidatorTypes: await loadContext({
		promptsMdFile: TASK_RESULTS_VALIDATOR_TYPES,
	}),
	taskResultJunctionManager: await loadContext({
		promptsMdFile: TASK_RESULT_JUNCTION_MANAGER,
	}),
	taskResultSummarizer: await loadContext({
		promptsMdFile: TASK_RESULTS_SUMMARIZER,
	}),
	// aux
	toolTypes: await loadContext({ promptsMdFile: TOOL_API_TYPE_FILE }),
	karpathyGuidelines: await loadContext({
		promptsMdFile: KARPATHY_GUIDELINES_PROMPTS_FILE,
	}),
	// schemas
	fileSystemSchema: await loadContext({
		promptsMdFile: FILE_SYSTEM_SCHEMA,
	}),
	// shell executor stuffs
	shellExecutor: await loadContext({
		promptsMdFile: SHELL_EXECUTOR_PROMPTS_FILE,
	}),
	shellExecutorTypes: await loadContext({
		promptsMdFile: SHELL_EXECUTOR_TYPE_FILE,
	}),
	// shellExecutorBranchAnalysisTypes: await loadContext({
	// 	promptsMdFile: SHELL_BRANCH_ANALYSIS_TYPE_FILE,
	// }),
	shellExecutorBranchAnalyst: await loadContext({
		promptsMdFile: SHELL_EXECUTOR_BRANCH_PROMPTS_FILE,
	}),
	shellExecutorBranchSimplifier: await loadContext({
		promptsMdFile: SHELL_EXECUTOR_BRANCH_SIMPLIFIER_PROMPTS_FILE,
	}),
	// shell results
	shellResultsAnalyzer: await loadContext({
		promptsMdFile: SHELL_RESULTS_ANALYZER_PROMPTS_FILE,
	}),
	shellResultsTypes: await loadContext({
		promptsMdFile: SHELL_RESULTS_TYPE_FILE,
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

export const llmDataNarrower = async (prompt: string) => llmQuery({prompt, contexts: [CONTEXTS.toolNarrower, CONTEXTS.toolTypes]})

/**
 * unused
 * @param prompt 
 * @returns 
 */
export const llmShellExecutor = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.shellExecutor})

/**
 * unused
 * @param prompt 
 * @returns 
 */
export const llmAnalyzeShellResults = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.shellResultsAnalyzer})

/**
 * used in {@link GetSecondOpinion} {@link AnalyzeShellResults}
 * @param prompt 
 * @returns 
 */
export const llmAnalyzeShellBranch = async (prompt: string) => llmQuery({prompt, contexts: [CONTEXTS.shellExecutorBranchAnalyst]})

/**
 * used in {@link SimplifyOpinion}
 * @param prompt 
 * @returns 
 */
export const llmShellBranAnalystSimplifier = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.shellExecutorBranchAnalyst})

/**
 * used in {@link executionValidator}
 * @param prompt 
 * @returns 
 */
export const llmTaskValidator = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.taskResultValidator})

/**
 * unused
 * @param prompt 
 * @returns 
 */
export const llmTaskResultJunctionManager = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.taskResultJunctionManager})

/**
 * used in {@link summarizeExecTransaction}
 * @param prompt 
 * @returns 
 */
export const llmTaskSummarizer = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.taskResultSummarizer})

/**
 * used in {@link manageExecutionResults}
 * @param prompt 
 * @returns 
 */
export const llmTaskTransactionManager = async (prompt: string) => llmQuery({prompt, contexts: CONTEXTS.taskTransactionManager})
