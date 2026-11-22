type TransactionManagerResponse = {
	transaction_status?:
		| 'success'
		| 'failure'
		| 'partial_success'
		| 'unknown_state';
	recoverability?:
		| 'recoverable'
		| 'non_recoverable'
		| 'environment_issue'
		| 'unknown';
	next_action?: { 
		type: 'retry' | 'terminate' | 'noop'; 
		prompt: string 
	};
	confidence?: number;
};

export {TransactionManagerResponse}