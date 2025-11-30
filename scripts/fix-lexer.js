#!/usr/bin/env node
/**
 * Post-processing script to fix ANTLR-generated TypeScript for the Kite lexer.
 * The grammar uses Java syntax in action blocks, which need to be converted to TypeScript.
 */

const fs = require('fs');
const path = require('path');

const lexerPath = path.join(__dirname, '../src/parser/grammar/KiteLexer.ts');

if (!fs.existsSync(lexerPath)) {
    console.error('KiteLexer.ts not found. Run generate-parser first.');
    process.exit(1);
}

let content = fs.readFileSync(lexerPath, 'utf8');

// Fix Java-style member declaration
content = content.replace(
    /private int interpolationDepth = 0;/g,
    'private interpolationDepth: number = 0;'
);

// Fix unqualified member access in actions
content = content.replace(
    /\binterpolationDepth\b(?!:)/g,
    'this.interpolationDepth'
);

// Fix setType call
content = content.replace(
    /setType\(INTERP_END\)/g,
    'this._type = KiteLexer.INTERP_END'
);

// Fix popMode call
content = content.replace(
    /popMode\(\)/g,
    'this.popMode()'
);

fs.writeFileSync(lexerPath, content, 'utf8');
console.log('Fixed KiteLexer.ts for TypeScript compatibility');
