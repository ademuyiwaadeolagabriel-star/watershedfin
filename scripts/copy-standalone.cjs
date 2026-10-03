const fs = require('fs');
const path = require('path');

const root = process.cwd();

function copyDir(source, destination) {
  if (!fs.existsSync(source)) {
    console.log(`Skipping missing directory: ${source}`);
    return;
  }

  fs.mkdirSync(destination, { recursive: true });

  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const src = path.join(source, entry.name);
    const dest = path.join(destination, entry.name);

    if (entry.isDirectory()) {
      copyDir(src, dest);
    } else {
      fs.copyFileSync(src, dest);
    }
  }
}

const standalone = path.join(root, '.next', 'standalone');
const standaloneNext = path.join(standalone, '.next');

if (!fs.existsSync(standalone)) {
  console.log(
    'Standalone directory was not created by Next.js. Skipping standalone asset copy.'
  );
  process.exit(0);
}

copyDir(
  path.join(root, '.next', 'static'),
  path.join(standaloneNext, 'static')
);

copyDir(
  path.join(root, 'public'),
  path.join(standalone, 'public')
);

console.log('Standalone assets copied successfully.');
