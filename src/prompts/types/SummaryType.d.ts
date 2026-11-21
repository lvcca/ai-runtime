export type SummaryType = {
	status: 'success' | 'failure' | 'partial_success' | 'unknown';
	summary: string;
	result: string;
	error: string;
	steps: string[];
	artifacts: string[];
};
