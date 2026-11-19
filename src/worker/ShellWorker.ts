import { call_llm_tasks } from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import { _Status, Status, TaskType } from '../state/types.ts';
import { setTask } from '../state/util.ts';
import { GetPlan, PlannerWorkerResultType, RevisePlan } from './Planner.ts';
import { appendToTransactionLog } from './util.ts';

const logger = getLogger('ShellWorker');

export const RunShellTask = async (_task_id: string, task: string) => {
	logger.debug(`run shell task`);

	await setTask({
		id: _task_id,
		status: { status: Status.RUNNING },
	});

	let final_output = '';
	let plan = '';
	let revised_plan = '';
	let status: _Status = Status.FAILED; // assume failed

	try {
		plan = await GetPlan(task);

		const result: PlannerWorkerResultType = await RevisePlan({
			task_id: _task_id,
			task,
			plan,
		});

		revised_plan = result.steps.join();

		final_output = await call_llm_tasks(`
You are a shell runner.

Your job is to complete the requested task using the provided plan.

ORIGINAL TASK:
${task}

PLAN:
${revised_plan}

RULES:
- Follow the steps carefully
- Be concise
- Do not explain your reasoning unless necessary
- Return only the completed result
`);

		await appendToTransactionLog({
			_id: _task_id,
			type: TaskType.SHELL_JOB,
			newUserRequest: task,
			newLLMResponse: plan,
		});

		status = Status.COMPLETED;
	} catch (e) {
		logger.error(`something went wrong in TaskWorker:RunTask: ${e}`);

		await appendToTransactionLog({
			_id: _task_id,
			type: TaskType.SHELL_JOB,
			newUserRequest: task,
			newLLMResponse: plan,
		});
	}

	await setTask({
		id: _task_id,
		status: { status },
		result: final_output,
	});

	return final_output;
};
