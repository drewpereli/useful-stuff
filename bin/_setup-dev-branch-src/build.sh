npx tsc;
echo "#!/usr/bin/env node\n" > ../setup-dev-branch;
cat ./dist/index.js >> ../setup-dev-branch;
