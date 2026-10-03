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

const arithmeticOperators = new Set([
  // Arithmetic
  ts.SyntaxKind.PlusToken,
  ts.SyntaxKind.MinusToken,
  ts.SyntaxKind.AsteriskToken,
  ts.SyntaxKind.SlashToken,
  ts.SyntaxKind.PercentToken,

  // Numeric comparisons
  ts.SyntaxKind.LessThanToken,
  ts.SyntaxKind.GreaterThanToken,
  ts.SyntaxKind.LessThanEqualsToken,
  ts.SyntaxKind.GreaterThanEqualsToken,
]);

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
    text.includes("Prisma.Decimal") ||
    text.includes("@prisma/client")
  );
}

function isNumberCall(node) {
  return (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.Identifier &&
    node.expression.text === "Number"
  );
}

function unwrapParentheses(node) {
  let current = node;

  while (
    ts.isParenthesizedExpression(current)
  ) {
    current = current.expression;
  }

  return current;
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
    if (ts.isBinaryExpression(node)) {
      const operator = node.operatorToken.kind;

      if (arithmeticOperators.has(operator)) {
        const left = unwrapParentheses(node.left);
        const right = unwrapParentheses(node.right);

        const leftType = checker.getTypeAtLocation(left);
        const rightType = checker.getTypeAtLocation(right);

        const leftDecimal = isDecimalType(leftType);
        const rightDecimal = isDecimalType(rightType);

        if (leftDecimal || rightDecimal) {
          if (leftDecimal && !isNumberCall(left)) {
            replacements.push({
              start: left.getStart(sourceFile),
              end: left.getEnd(),
              text: `Number(${left.getText(sourceFile)} ?? 0)`,
            });
          }

          if (rightDecimal && !isNumberCall(right)) {
            replacements.push({
              start: right.getStart(sourceFile),
              end: right.getEnd(),
              text: `Number(${right.getText(sourceFile)} ?? 0)`,
            });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (replacements.length === 0) {
    continue;
  }

  // Remove overlapping replacements.
  replacements.sort((a, b) => {
    if (a.start !== b.start) return a.start - b.start;
    return b.end - a.end;
  });

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
    `Fixed ${replacements.length} Decimal arithmetic expression(s): ${path.relative(
      rootDir,
      fileName
    )}`
  );
}

console.log("");
console.log(`Total Decimal arithmetic fixes: ${totalChanges}`);
