import { promisify } from 'node:util';
import { exec as execCb } from 'node:child_process';

const branches = ['a', 'b', 'c'];

async function test() {
  try {
    await reset();

    await exec('git checkout -b dev');
    await exec('git checkout master');

    for (const branch of branches) {
      await exec(`git checkout -b ${branch}`);

      for (const idx of [1, 2]) {
        await exec(`echo ${branch} > ${branch}-${idx}.txt`);
        await exec(`git add ${branch}-${idx}.txt`);
        await exec(`git commit -m "added ${branch}-${idx}.txt"`);
      }
    }

    await exec('npm run start -- a b c');
  } finally {
    await exec('git reset --hard');
    await exec('git checkout master');
  }
}

async function reset() {
  await exec('git checkout master');
  await Promise.all(
    [...branches, 'dev'].map(async (branch) => {
      const exists = await branchExists(branch);
      if (exists) await exec(`git branch -D ${branch}`);
    })
  );
}

const execPromise = promisify(execCb);

async function exec(command: string): Promise<string> {
  const { stdout } = await execPromise(command);
  return stdout.trim();
}

async function branchExists(branch: string): Promise<boolean> {
  try {
    await exec(`git rev-parse --verify ${branch}`);
    return true;
  } catch (e) {
    return false;
  }
}

test();
