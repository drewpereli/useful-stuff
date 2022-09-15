const pug = require('pug');
const fs = require('fs').promises;
const pr = require('path').resolve;

const TEMPLATE_PATH = pr(__dirname, './src/template.pug');
const LANGUAGES_PATH = pr(__dirname, './src/languages');

(async () => {
  const template = pug.compileFile(TEMPLATE_PATH);

  const files = await fs.readdir(LANGUAGES_PATH);

  await Promise.all(files.map((file) => createCheatSheet(file, template)));
})();

async function createCheatSheet(file, template) {
  const path = pr(LANGUAGES_PATH, file);

  const data = require(path);

  const name = file.split('.')[0];

  const htmlPath = pr(__dirname, `./dist/${name}.html`);

  const html = template({ name, data });

  await fs.writeFile(htmlPath, html);
}
