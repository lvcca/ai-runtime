import { app } from '../server/server.ts';
import { ExecCallerType } from '../state/types.ts';
import {
	newExec,
	newTaskDirect,
	newTask,
	allExec,
	newJob,
	allTasks,
	validateIncomingTraffic,
	deleteTask,
	deleteExec,
	deleteJob,
	allJobs,
} from './util.ts';

// all incoming traffic
app.use(_try(validateIncomingTraffic));

// sanity check
app.get('/', _try((_, res) => res.status(200).send(`Hello world! ${new Date()}`)));

// Tasks, general purpose task
app.get(['/task/', '/task/allTasks'], _try(allTasks));
app.get('/task/newTaskDirect', _try(newTaskDirect));
app.get('/task/newTask', _try(newTask));
app.get('/task/delete', _try(deleteTask));

// Execs, general purpose execution
app.get(['/exec/', '/exec/allExecs'], _try(allExec));
app.get('/exec/newExec', _try(async (req, res) => await newExec({res, req, callerType: ExecCallerType.ENDPOINT})));
app.get('/exec/deleteExec', _try(deleteExec));

// Jobs, general purpose job / service
app.get(['/job/', '/job/allJobs'], _try(allJobs));
app.get('/job/newJob', _try(newJob));
app.get('/job/deleteJob', _try(deleteJob));

// Shell Jobs, general purpose os shell jobs
app.get(['/shelljob/', '/shelljob/allJobs']);
app.get('/shelljob/newJob');
app.get('/shelljob/deleteJob');
