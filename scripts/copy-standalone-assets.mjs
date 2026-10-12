import { cpSync, existsSync, mkdirSync } from "node:fs";

const staticSource = ".next/static";
const staticTarget = ".next/standalone/.next/static";
const publicSource = "public";
const publicTarget = ".next/standalone/public";
const pdfkitFontsSource = "node_modules/pdfkit/js/standard-fonts";
const pdfkitFontsTarget =
  ".next/standalone/node_modules/pdfkit/js/standard-fonts";

if (!existsSync(".next/standalone/server.js")) {
  console.error("Standalone server not found. Run the production build first.");
  process.exit(1);
}

mkdirSync(".next/standalone/.next", { recursive: true });

if (existsSync(staticSource)) {
  cpSync(staticSource, staticTarget, { recursive: true });
}

if (existsSync(publicSource)) {
  cpSync(publicSource, publicTarget, { recursive: true });
}

if (existsSync(pdfkitFontsSource)) {
  mkdirSync(pdfkitFontsTarget, { recursive: true });
  cpSync(pdfkitFontsSource, pdfkitFontsTarget, {
    recursive: true,
    force: true,
  });
  console.log("PDFKit standard fonts copied successfully.");
} else {
  console.warn("PDFKit standard-fonts source directory not found.");
}

console.log("Standalone static assets copied successfully.");
