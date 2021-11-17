import dotenv from 'dotenv';
import { Issue, LinearClient } from '@linear/sdk';
import { exec } from 'child-process-promise';

dotenv.config();

const linearClient = new LinearClient({
  apiKey: process.env.LINEAR_API_KEY,
});


async function main() {
	const issueId = process.argv[2];

	if (issueId === undefined) {
		console.log('Please supply an issue as the first and only argument');
		return;
	}

  const issue = await linearClient.issue(issueId);

  if (!issue) {
    console.log('Issue not found');
    return;
  }

  const commitMessage = `${issue.identifier} ${escapeDoubleQuotes(issue.title)}`;

  await exec(`git commit -m "${commitMessage}"`);

	console.log('Committed with message: ' + commitMessage);

  await markIssueAsCompleted(issue);
	console.log('Marked issue as complete');
}

async function markIssueAsCompleted(issue: Issue) {
  const workflowStates = await linearClient.workflowStates();

  const completeState = workflowStates.nodes.find(
    (state) => state.type === 'completed'
  );

  await issue.update({ stateId: completeState.id });
}

// NOTE: only escapes a " if it's not already escaped
function escapeDoubleQuotes(str: string): string {
	return str.replace(/\\([\s\S])|(")/g,"\\$1$2");
}

main();
