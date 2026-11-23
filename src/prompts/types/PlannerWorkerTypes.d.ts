export type PlannerWorkerResultType = {
	approved: boolean;
	steps: string[];
	revise_plan: boolean;
	plan_feedback: string;
};

export type PlannerWorkerPlan = {
	steps: string[];
};
