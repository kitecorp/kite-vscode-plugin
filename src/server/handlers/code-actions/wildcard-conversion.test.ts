/**
 * Tests for wildcard to named import conversion.
 */

import { describe, it, expect } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { createWildcardConversionAction, findUsedSymbolsFromFile, collectExportedSymbols } from './wildcard-conversion';

function createDocument(content: string, uri = 'file:///project/main.kite'): TextDocument {
    return TextDocument.create(uri, 'kite', 1, content);
}

describe('collectExportedSymbols', () => {
    it('collects schema definitions', () => {
        const content = `schema Config {
    string name
}`;
        const symbols = collectExportedSymbols(content);
        expect(symbols).toContain('Config');
    });

    it('collects component definitions', () => {
        const content = `component Server {
    input string name
}`;
        const symbols = collectExportedSymbols(content);
        expect(symbols).toContain('Server');
    });

    it('collects function definitions', () => {
        const content = `fun calculate(number x) number {
    return x * 2
}`;
        const symbols = collectExportedSymbols(content);
        expect(symbols).toContain('calculate');
    });

    it('collects type definitions', () => {
        const content = `type Region = "us-east-1" | "us-west-2"`;
        const symbols = collectExportedSymbols(content);
        expect(symbols).toContain('Region');
    });

    it('collects variable definitions', () => {
        const content = `var defaultPort = 8080`;
        const symbols = collectExportedSymbols(content);
        expect(symbols).toContain('defaultPort');
    });

    it('collects resource definitions', () => {
        const content = `resource Config server {
    name = "main"
}`;
        const symbols = collectExportedSymbols(content);
        expect(symbols).toContain('server');
    });

    it('collects multiple symbols', () => {
        const content = `schema Config {
    string name
}

component Server {
    input string host
}

fun calculate() number {
    return 1
}

var port = 8080`;
        const symbols = collectExportedSymbols(content);
        expect(symbols).toContain('Config');
        expect(symbols).toContain('Server');
        expect(symbols).toContain('calculate');
        expect(symbols).toContain('port');
    });

    it('does not collect nested declarations', () => {
        const content = `component Server {
    input string name
    var internal = 1
}`;
        const symbols = collectExportedSymbols(content);
        expect(symbols).toContain('Server');
        expect(symbols).not.toContain('internal');
        expect(symbols).not.toContain('name');
    });
});

describe('findUsedSymbolsFromFile', () => {
    it('finds used schema in resource declaration', () => {
        const text = `import * from "types.kite"
resource Config server {}`;
        const exported = ['Config', 'Other'];
        const used = findUsedSymbolsFromFile(text, exported);
        expect(used).toContain('Config');
        expect(used).not.toContain('Other');
    });

    it('finds used component type', () => {
        const text = `import * from "components.kite"
component Server api {}`;
        const exported = ['Server', 'Database'];
        const used = findUsedSymbolsFromFile(text, exported);
        expect(used).toContain('Server');
        expect(used).not.toContain('Database');
    });

    it('finds used function calls', () => {
        const text = `import * from "utils.kite"
var result = calculate(5)`;
        const exported = ['calculate', 'format'];
        const used = findUsedSymbolsFromFile(text, exported);
        expect(used).toContain('calculate');
        expect(used).not.toContain('format');
    });

    it('finds used type references', () => {
        const text = `import * from "types.kite"
var x Region = "us-east-1"`;
        const exported = ['Region', 'Zone'];
        const used = findUsedSymbolsFromFile(text, exported);
        expect(used).toContain('Region');
    });

    it('finds symbols in string interpolation', () => {
        const text = `import * from "vars.kite"
var message = "Port is \${port}"`;
        const exported = ['port', 'host'];
        const used = findUsedSymbolsFromFile(text, exported);
        expect(used).toContain('port');
    });

    it('finds symbols with simple interpolation', () => {
        const text = `import * from "vars.kite"
var message = "Port is $port"`;
        const exported = ['port', 'host'];
        const used = findUsedSymbolsFromFile(text, exported);
        expect(used).toContain('port');
    });

    it('does not match partial words', () => {
        const text = `import * from "types.kite"
var portNumber = 8080`;
        const exported = ['port'];
        const used = findUsedSymbolsFromFile(text, exported);
        expect(used).not.toContain('port');
    });

    it('skips symbols in import statements', () => {
        const text = `import * from "types.kite"
import Config from "other.kite"`;
        const exported = ['Config'];
        const used = findUsedSymbolsFromFile(text, exported);
        // Config appears in import, but we should find actual usage
        expect(used).toHaveLength(0);
    });

    it('returns sorted unique symbols', () => {
        const text = `import * from "types.kite"
resource Config a {}
resource Config b {}
var x = calculate()
var y = calculate()`;
        const exported = ['Config', 'calculate'];
        const used = findUsedSymbolsFromFile(text, exported);
        expect(used).toEqual(['Config', 'calculate']);
    });
});

describe('createWildcardConversionAction', () => {
    const mockCtx = {
        findKiteFilesInWorkspace: () => ['/project/types.kite'],
        getFileContent: (path: string) => {
            if (path.includes('types.kite')) {
                return `schema Config { string name }
fun calculate() number { return 1 }`;
            }
            return null;
        },
    };

    it('creates action for wildcard import with used symbols', () => {
        const doc = createDocument(`import * from "types.kite"
resource Config server {}`);
        const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 26 } };

        const action = createWildcardConversionAction(doc, range, mockCtx);

        expect(action).not.toBeNull();
        expect(action?.title).toBe('Convert to named import');
        expect(action?.edit?.changes).toBeDefined();
    });

    it('returns null when no symbols are used', () => {
        const doc = createDocument(`import * from "types.kite"
var x = 1`);
        const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 26 } };

        const action = createWildcardConversionAction(doc, range, mockCtx);

        expect(action).toBeNull();
    });

    it('returns null when file not found', () => {
        const ctx = {
            findKiteFilesInWorkspace: () => [],
            getFileContent: () => null,
        };
        const doc = createDocument(`import * from "unknown.kite"`);
        const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 28 } };

        const action = createWildcardConversionAction(doc, range, ctx);

        expect(action).toBeNull();
    });

    it('generates correct replacement text', () => {
        const doc = createDocument(`import * from "types.kite"
resource Config server {}
var x = calculate()`);
        const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 26 } };

        const action = createWildcardConversionAction(doc, range, mockCtx);

        const edit = action?.edit?.changes?.[doc.uri]?.[0];
        expect(edit?.newText).toBe('import Config, calculate from "types.kite"');
    });

    it('handles single used symbol', () => {
        const doc = createDocument(`import * from "types.kite"
resource Config server {}`);
        const range = { start: { line: 0, character: 0 }, end: { line: 0, character: 26 } };

        const action = createWildcardConversionAction(doc, range, mockCtx);

        const edit = action?.edit?.changes?.[doc.uri]?.[0];
        expect(edit?.newText).toBe('import Config from "types.kite"');
    });
});
