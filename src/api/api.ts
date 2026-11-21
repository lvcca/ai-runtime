import { app } from '../server/server.ts';
import {
	newExecCommon,
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

// all apis
app.get('/', (_, res) => res.status(200).send(`Hello world! ${new Date()}`));

// Tasks, general purpose task
app.get(['/task/', '/task/allTasks'], _try(allTasks));
app.get('/task/newTaskDirect', _try(newTaskDirect));
app.get('/task/newTask', _try(newTask));
app.get('/task/delete', _try(deleteTask));

// Execs, general purpose execution
app.get(['/exec/', '/exec/allExecs'], _try(allExec));
app.get('/exec/newExec', _try(newExecCommon));
app.get('/exec/deleteExec', _try(deleteExec));

// Jobs, general purpose job / service
app.get(['/job/', '/job/allJobs'], _try(allJobs));
app.get('/job/newJob', _try(newJob));
app.get('/job/deleteJob', _try(deleteJob));

// Shell Jobs, general purpose os shell jobs
app.get(['/shelljob/', '/shelljob/allJobs']);
app.get('/shelljob/newJob');
app.get('/shelljob/deleteJob');
