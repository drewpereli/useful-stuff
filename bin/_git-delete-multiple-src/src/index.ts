import inquirer from 'inquirer';
import { exec as execCB } from 'child_process';
import { promisify } from 'util';

const exec = promisify(execCB);

async function getOtherBranches() {
  const out = await exec('git branch');

  return out.stdout
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !/^\*/.test(l));
}

async function deleteBranches() {
  const options = (await getOtherBranches()).filter(
    (b) => b !== 'master' && b !== 'main'
  );

  const { branches }: { branches: string[] } = await inquirer.prompt([
    {
      type: 'checkbox',
      name: 'branches',
      message: 'Which branches would you like to delete?',
      choices: options,
      pageSize: 15,
      loop: false,
    },
  ]);

  await Promise.all(branches.map((b) => exec(`git branch -D ${b}`)));
}

deleteBranches();
