import { promisify } from 'node:util';
import { exec as execCb } from 'node:child_process';
import fs from 'node:fs/promises';

async function setupDevBranches(branches: string[]) {
  if (!(await branchExists('dev'))) {
    await exec('git checkout -b dev');
  } else {
    await exec('git checkout dev');
  }

  const mainBranch = await getMainBranchName();

  // reset dev to master
  await exec(`git reset --hard ${mainBranch}`);

  for (const branch of branches) {
    await rebaseOntoDev(branch, mainBranch);
    await squashIntoDev(branch);
  }

  await exec(`git checkout ${branches[branches.length - 1]}`);
}

async function rebaseOntoDev(branch: string, mainBranch: string) {
  await exec(`git checkout ${branch}`);

  const hash = await getCommitToRebaseOnto(mainBranch);

  console.log(`Rebasing ${branch}...`);

  await exec(`git rebase --onto dev ${hash}`);
}

async function squashIntoDev(branch: string) {
  await exec(`git checkout dev`);


  await exec(`git merge --squash ${branch}`);

  const hasChanges = !!(await exec('git status --porcelain'));

  if (!hasChanges) {
    console.log(`No changes to squash from ${branch}`);
    return;
  }

  console.log(`Squashing ${branch} into dev...`);

  await exec(
    `git add -A && git commit -am "${branch} (squashed)" --no-verify`
  );
}

const execPromise = promisify(execCb);

async function exec(command: string): Promise<string> {
  const { stdout } = await execPromise(command);
  return stdout.trim();
}

async function main() {
  const cacheFile = '_setup-dev-branch-cache.json';

  let branches = process.argv.slice(2);
  const mustWriteCache = branches.length !== 0;

  if (branches.length === 0) {
    const ex = await fileExists(cacheFile);

    if (!ex) {
      console.error('Branches not specified and no cache file found');
      process.exit(1);
    }

    const cache: string[] = JSON.parse(await fs.readFile(cacheFile, 'utf-8'));

    console.log('Using cached branches:', cache.join(', '));

    branches = cache;
  }

  await setupDevBranches(branches);

  if (mustWriteCache) {
    await fs.writeFile(cacheFile, JSON.stringify(branches), 'utf-8');
  }

  console.log('Done');
}

async function fileExists(path: string) {
  try {
    await fs.access(path);
    return true;
  } catch {
    return false;
  }
}

// We want to do rebase --onto dev {SOME_COMMIT_HASH}
// This function finds the commit hash to use
// Assumes that the desired rebase branch is checked out
// It will look for the last commit that ends with "(squashed)", which is likely the last commit that was from dev
// If it doesn't find one, it will just use the merge-base of master and the current branch
async function getCommitToRebaseOnto(mainBranch: string) {
  const glog = await exec("git log --pretty=format:'%h %s'");
  const lines = glog.split('\n');

  const lastDev = lines.find((line) => {
    const message = line.split(' ').slice(1).join(' ').trim();
    return /\(squashed\)$/.test(message);
  });

  if (lastDev) {
    return lastDev.split(' ')[0];
  }

  return await exec(`git merge-base ${mainBranch} @`);
}

async function branchExists(name: string) {
  const res = await exec(`git branch --list ${name}`);

  return !!res;
}

async function getMainBranchName() {
  const mainExists = await branchExists('main');

  if (mainExists) {
    return 'main';
  }

  return 'master';
}

main();
