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
app.use(validateIncomingTraffic);

// all apis
app.get('/', (_, res) => res.status(200).send(`Hello world! ${new Date()}`));

// Tasks
app.get(['/task/', '/task/allTasks'], allTasks);
app.get('/task/newTaskDirect', newTaskDirect);
app.get('/task/newTask', newTask);
app.get('/task/delete', deleteTask);

// Execs
app.get(['/exec/', '/exec/allExecs'], allExec);
app.get('/exec/newExec', newExecCommon);
app.get('/exec/deleteExec', deleteExec);

// Jobs
app.get(['/job/', '/job/allJobs'], allJobs);
app.get('/job/newJob', newJob);
app.get('/job/deleteJob', deleteJob);

// Shell Jobs
app.get(['/shelljob/', '/shelljob/allJobs']);
app.get('/shelljob/newJob');
app.get('/shelljob/deleteJob');
