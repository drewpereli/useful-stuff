import inquirer from 'inquirer';
import { exec as execCB } from 'child_process';
import { promisify } from 'util';
import fuzzy from 'fuzzy';
import { multiValSorter } from './sorter.js';
import inquirerPrompt from 'inquirer-autocomplete-prompt';

inquirer.registerPrompt('autocomplete', inquirerPrompt);

const exec = promisify(execCB);

function fuzzyMatches(input: string, options: string[]): string[] {
  const result = fuzzy.filter(input, options);
  const sorted = result.sort(multiValSorter((el) => [-el.score, el.string]));

  return sorted.map((el) => el.string);
}

async function selectBranch() {
  const branches = await getOtherBranches();

  const { branch }: { branch: string } = await inquirer.prompt([
    {
      type: 'autocomplete',
      source(_: unknown, input: string) {
        const matches = input ? fuzzyMatches(input, branches) : branches;
        return Promise.resolve(matches);
      },
      name: 'branch',
      message: 'Which branch?',
      loop: false,
      pageSize: 20,
    },
  ]);

  console.log(`Merging ${branch}...`);

  await exec(
    `git merge --squash ${branch} && git add -A && git commit -am "${branch} (squashed)"`
  );
}

async function getOtherBranches() {
  const out = await exec('git branch');

  return out.stdout
    .trim()
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => !/^\*/.test(l));
}

selectBranch();
