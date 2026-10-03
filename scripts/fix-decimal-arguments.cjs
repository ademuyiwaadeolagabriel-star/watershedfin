const ts = require("typescript");
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();

const configPath = path.join(rootDir, "tsconfig.json");
const configFile = ts.readConfigFile(configPath, ts.sys.readFile);

if (configFile.error) {
  console.error(
    ts.flattenDiagnosticMessageText(configFile.error.messageText, "\n")
  );
  process.exit(1);
}

const parsed = ts.parseJsonConfigFileContent(
  configFile.config,
  ts.sys,
  rootDir
);

const program = ts.createProgram({
  rootNames: parsed.fileNames,
  options: parsed.options,
});

const checker = program.getTypeChecker();

function isDecimalType(type) {
  if (!type) return false;

  const symbol = type.getSymbol?.();

  if (symbol?.getName?.() === "Decimal") {
    return true;
  }

  if (type.aliasSymbol?.getName?.() === "Decimal") {
    return true;
  }

  const text = checker.typeToString(type);

  return (
    text === "Decimal" ||
    text.endsWith(".Decimal") ||
    text.includes("Prisma.Decimal")
  );
}

function containsDecimal(type) {
  if (!type) return false;

  if (isDecimalType(type)) {
    return true;
  }

  if (type.isUnion?.()) {
    return type.types.some(containsDecimal);
  }

  if (type.isIntersection?.()) {
    return type.types.some(containsDecimal);
  }

  return false;
}

function containsNumber(type) {
  if (!type) return false;

  if (type.flags & ts.TypeFlags.NumberLike) {
    return true;
  }

  if (type.isUnion?.()) {
    return type.types.some(containsNumber);
  }

  if (type.isIntersection?.()) {
    return type.types.some(containsNumber);
  }

  return false;
}

function isAlreadyNumberCall(node) {
  return (
    ts.isCallExpression(node) &&
    ts.isIdentifier(node.expression) &&
    node.expression.text === "Number"
  );
}

const changesByFile = new Map();

for (const sourceFile of program.getSourceFiles()) {
  const fileName = sourceFile.fileName;

  if (
    fileName.includes("node_modules") ||
    fileName.includes(".next") ||
    !/\.(ts|tsx)$/.test(fileName)
  ) {
    continue;
  }

  const replacements = [];

  function visit(node) {
    if (ts.isCallExpression(node)) {
      const signature = checker.getResolvedSignature(node);

      if (signature) {
        const parameters = signature.getParameters();

        node.arguments.forEach((arg, index) => {
          const argType = checker.getTypeAtLocation(arg);

          if (!isDecimalType(argType) && !containsDecimal(argType)) {
            return;
          }

          const parameter = parameters[index];

          if (!parameter) {
            return;
          }

          const parameterType =
            checker.getTypeOfSymbolAtLocation(
              parameter,
              node
            );

          const parameterAcceptsDecimal =
            containsDecimal(parameterType);

          const parameterAcceptsNumber =
            containsNumber(parameterType);

          // Only fix Decimal values being passed into
          // number-only parameters.
          if (
            parameterAcceptsNumber &&
            !parameterAcceptsDecimal &&
            !isAlreadyNumberCall(arg)
          ) {
            replacements.push({
              start: arg.getStart(sourceFile),
              end: arg.getEnd(),
              text: `Number(${arg.getText(sourceFile)} ?? 0)`,
            });
          }
        });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (replacements.length === 0) {
    continue;
  }

  replacements.sort((a, b) => a.start - b.start);

  const filtered = [];

  for (const replacement of replacements) {
    const previous = filtered[filtered.length - 1];

    if (
      previous &&
      replacement.start >= previous.start &&
      replacement.end <= previous.end
    ) {
      continue;
    }

    filtered.push(replacement);
  }

  changesByFile.set(fileName, filtered);
}

let totalChanges = 0;

for (const [fileName, replacements] of changesByFile) {
  let text = fs.readFileSync(fileName, "utf8");

  replacements
    .sort((a, b) => b.start - a.start)
    .forEach((replacement) => {
      text =
        text.slice(0, replacement.start) +
        replacement.text +
        text.slice(replacement.end);

      totalChanges++;
    });

  fs.writeFileSync(fileName, text, "utf8");

  console.log(
    `Fixed ${replacements.length} Decimal -> number argument(s): ${path.relative(
      rootDir,
      fileName
    )}`
  );
}

console.log("");
console.log(
  `Total Decimal -> number argument fixes: ${totalChanges}`
);