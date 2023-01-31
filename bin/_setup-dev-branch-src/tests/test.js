"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const node_util_1 = require("node:util");
const node_child_process_1 = require("node:child_process");
const branches = ['a', 'b', 'c'];
function test() {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield reset();
            yield exec('git checkout -b dev');
            yield exec('git checkout master');
            for (const branch of branches) {
                yield exec(`git checkout -b ${branch}`);
                for (const idx of [1, 2]) {
                    yield exec(`echo ${branch} > ${branch}-${idx}.txt`);
                    yield exec(`git add ${branch}-${idx}.txt`);
                    yield exec(`git commit -m "added ${branch}-${idx}.txt"`);
                }
            }
            yield exec('npm run start -- a b c');
        }
        finally {
            yield exec('git reset --hard');
            yield exec('git checkout master');
        }
    });
}
function reset() {
    return __awaiter(this, void 0, void 0, function* () {
        yield exec('git checkout master');
        yield Promise.all([...branches, 'dev'].map((branch) => __awaiter(this, void 0, void 0, function* () {
            const exists = yield branchExists(branch);
            if (exists)
                yield exec(`git branch -D ${branch}`);
        })));
    });
}
const execPromise = (0, node_util_1.promisify)(node_child_process_1.exec);
function exec(command) {
    return __awaiter(this, void 0, void 0, function* () {
        const { stdout } = yield execPromise(command);
        return stdout.trim();
    });
}
function branchExists(branch) {
    return __awaiter(this, void 0, void 0, function* () {
        try {
            yield exec(`git rev-parse --verify ${branch}`);
            return true;
        }
        catch (e) {
            return false;
        }
    });
}
test();
//# sourceMappingURL=test.js.map