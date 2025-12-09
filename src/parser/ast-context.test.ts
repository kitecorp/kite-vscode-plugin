/**
 * Tests for AST context utilities.
 */

import { describe, it, expect } from 'vitest';
import {
    getCursorContext,
    isInDecoratorContext,
    getDotAccessTarget,
    extractSchemaPropertiesAST,
    extractComponentInputsAST,
    extractComponentOutputsAST,
    findSchemaByName,
    findComponentDefByName,
    extractImportsAST,
    findLastImportLineAST,
    findImportByPathAST,
    findSchemaDefinitionAST,
    findComponentDefinitionAST,
    findFunctionDefinitionAST,
    findTypeDefinitionAST,
    findSchemaPropertyAST,
    findComponentInputAST,
} from './ast-context';
import { parseKite } from './parse-utils';

describe('getCursorContext', () => {
    describe('schema body context', () => {
        it('should detect cursor inside schema body', () => {
            const text = `schema Config {
    string |
}`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.type).toBe('schema-body');
            expect(ctx.enclosingDeclaration?.type).toBe('schema');
            expect(ctx.enclosingDeclaration?.name).toBe('Config');
        });

        it('should not be value context at start of schema property line', () => {
            const text = `schema Config {
    |
}`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.type).toBe('schema-body');
            expect(ctx.isValueContext).toBe(false);
        });
    });

    describe('resource body context', () => {
        it('should detect cursor inside resource body', () => {
            const text = `resource ServerConfig server {
    host = |
}`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.type).toBe('resource-body');
            expect(ctx.enclosingDeclaration?.type).toBe('resource');
            expect(ctx.enclosingDeclaration?.name).toBe('server');
            expect(ctx.enclosingDeclaration?.typeName).toBe('ServerConfig');
        });

        it('should detect value context after equals', () => {
            const text = `resource Config server {
    port = |
}`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.isValueContext).toBe(true);
        });

        it('should track already set properties', () => {
            const text = `resource Config server {
    host = "localhost"
    port = 8080
    |
}`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.alreadySetProperties.has('host')).toBe(true);
            expect(ctx.alreadySetProperties.has('port')).toBe(true);
        });
    });

    describe('component definition body context', () => {
        it('should detect cursor inside component definition', () => {
            const text = `component WebServer {
    input string name = |
}`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.type).toBe('component-def-body');
            expect(ctx.enclosingDeclaration?.type).toBe('component-def');
            expect(ctx.enclosingDeclaration?.name).toBe('WebServer');
        });
    });

    describe('component instantiation body context', () => {
        it('should detect cursor inside component instantiation', () => {
            const text = `component WebServer api {
    name = |
}`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.type).toBe('component-inst-body');
            expect(ctx.enclosingDeclaration?.type).toBe('component-inst');
            expect(ctx.enclosingDeclaration?.name).toBe('api');
            expect(ctx.enclosingDeclaration?.typeName).toBe('WebServer');
        });
    });

    describe('function body context', () => {
        it('should detect cursor inside function body', () => {
            const text = `fun calculate(number x) number {
    var result = |
}`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.type).toBe('function-body');
            expect(ctx.enclosingDeclaration?.type).toBe('function');
            expect(ctx.enclosingDeclaration?.name).toBe('calculate');
        });
    });

    describe('top level context', () => {
        it('should detect top level context', () => {
            const text = `|schema Config { }`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.type).toBe('top-level');
        });
    });

    describe('value context detection', () => {
        it('should not treat == as value context', () => {
            const text = `if (x == |)`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.isValueContext).toBe(false);
        });

        it('should not treat != as value context', () => {
            const text = `if (x != |)`;
            const offset = text.indexOf('|');
            const ctx = getCursorContext(text.replace('|', ''), offset);

            expect(ctx.isValueContext).toBe(false);
        });
    });
});

describe('isInDecoratorContext', () => {
    it('should detect after @', () => {
        const text = '@';
        expect(isInDecoratorContext(text, text.length)).toBe(true);
    });

    it('should detect partial decorator name', () => {
        const text = '@clo';
        expect(isInDecoratorContext(text, text.length)).toBe(true);
    });

    it('should not detect in regular context', () => {
        const text = 'var x = 5';
        expect(isInDecoratorContext(text, text.length)).toBe(false);
    });
});

describe('getDotAccessTarget', () => {
    it('should get identifier before dot', () => {
        const text = 'config.';
        expect(getDotAccessTarget(text, text.length)).toBe('config');
    });

    it('should return null when no dot access', () => {
        const text = 'config';
        expect(getDotAccessTarget(text, text.length)).toBeNull();
    });

    it('should get base name for numeric indexed access', () => {
        const text = 'server[0].';
        expect(getDotAccessTarget(text, text.length)).toBe('server');
    });

    it('should get base name for string indexed access with double quotes', () => {
        const text = 'data["prod"].';
        expect(getDotAccessTarget(text, text.length)).toBe('data');
    });

    it('should get base name for string indexed access with single quotes', () => {
        const text = "data['dev'].";
        expect(getDotAccessTarget(text, text.length)).toBe('data');
    });

    it('should get base name for multi-digit index', () => {
        const text = 'server[123].';
        expect(getDotAccessTarget(text, text.length)).toBe('server');
    });

    it('should handle whitespace after dot', () => {
        const text = 'server[0].  ';
        expect(getDotAccessTarget(text, text.length)).toBe('server');
    });
});

describe('extractSchemaPropertiesAST', () => {
    it('should extract schema properties', () => {
        const text = `schema ServerConfig {
    string host
    number port = 8080
    boolean ssl = true
}`;
        const result = parseKite(text);
        const schema = findSchemaByName(result.tree!, 'ServerConfig');
        expect(schema).not.toBeNull();

        const props = extractSchemaPropertiesAST(schema!);
        expect(props).toHaveLength(3);

        const hostProp = props.find(p => p.name === 'host');
        expect(hostProp?.typeName).toBe('string');
        expect(hostProp?.hasDefault).toBe(false);

        const portProp = props.find(p => p.name === 'port');
        expect(portProp?.typeName).toBe('number');
        expect(portProp?.hasDefault).toBe(true);
    });
});

describe('extractComponentInputsAST', () => {
    it('should extract component inputs', () => {
        const text = `component WebServer {
    input string name = "default"
    input number replicas
}`;
        const result = parseKite(text);
        const comp = findComponentDefByName(result.tree!, 'WebServer');
        expect(comp).not.toBeNull();

        const inputs = extractComponentInputsAST(comp!);
        expect(inputs).toHaveLength(2);

        const nameInput = inputs.find(i => i.name === 'name');
        expect(nameInput?.typeName).toBe('string');
        expect(nameInput?.hasDefault).toBe(true);

        const replicasInput = inputs.find(i => i.name === 'replicas');
        expect(replicasInput?.typeName).toBe('number');
        expect(replicasInput?.hasDefault).toBe(false);
    });
});

describe('extractComponentOutputsAST', () => {
    it('should extract component outputs', () => {
        const text = `component WebServer {
    output string endpoint = "http://localhost"
    output number actualReplicas
}`;
        const result = parseKite(text);
        const comp = findComponentDefByName(result.tree!, 'WebServer');
        expect(comp).not.toBeNull();

        const outputs = extractComponentOutputsAST(comp!);
        expect(outputs).toHaveLength(2);

        expect(outputs.find(o => o.name === 'endpoint')).toBeDefined();
        expect(outputs.find(o => o.name === 'actualReplicas')).toBeDefined();
    });
});

describe('extractImportsAST', () => {
    it('should extract wildcard imports', () => {
        const text = `import * from "common.kite"
import * from "aws.kite"

schema Config { }`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const imports = extractImportsAST(result.tree!);
        expect(imports).toHaveLength(2);

        expect(imports[0].path).toBe('common.kite');
        expect(imports[0].isWildcard).toBe(true);
        expect(imports[0].line).toBe(0);

        expect(imports[1].path).toBe('aws.kite');
        expect(imports[1].isWildcard).toBe(true);
        expect(imports[1].line).toBe(1);
    });

    it('should return empty array for no imports', () => {
        const text = `schema Config { }`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const imports = extractImportsAST(result.tree!);
        expect(imports).toHaveLength(0);
    });
});

describe('findLastImportLineAST', () => {
    it('should find last import line', () => {
        const text = `import * from "a.kite"
import * from "b.kite"
import * from "c.kite"

schema Config { }`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const lastLine = findLastImportLineAST(result.tree!);
        expect(lastLine).toBe(2); // 0-indexed, third import is on line 2
    });

    it('should return -1 for no imports', () => {
        const text = `schema Config { }`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const lastLine = findLastImportLineAST(result.tree!);
        expect(lastLine).toBe(-1);
    });
});

describe('findImportByPathAST', () => {
    it('should find import by path', () => {
        const text = `import * from "common.kite"
import * from "aws.kite"`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const found = findImportByPathAST(result.tree!, 'aws.kite');
        expect(found).not.toBeNull();
        expect(found?.path).toBe('aws.kite');
        expect(found?.isWildcard).toBe(true);
    });

    it('should return null for non-existent path', () => {
        const text = `import * from "common.kite"`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const found = findImportByPathAST(result.tree!, 'nonexistent.kite');
        expect(found).toBeNull();
    });
});

describe('findSchemaDefinitionAST', () => {
    it('should find schema definition location', () => {
        const text = `schema ServerConfig {
    string host
}`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const loc = findSchemaDefinitionAST(result.tree!, 'ServerConfig');
        expect(loc).not.toBeNull();
        expect(loc?.name).toBe('ServerConfig');
        expect(loc?.line).toBe(0);
    });

    it('should return null for non-existent schema', () => {
        const text = `schema Config { }`;
        const result = parseKite(text);
        const loc = findSchemaDefinitionAST(result.tree!, 'NonExistent');
        expect(loc).toBeNull();
    });
});

describe('findFunctionDefinitionAST', () => {
    it('should find function definition location', () => {
        const text = `fun calculate(number x) number {
    return x * 2
}`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const loc = findFunctionDefinitionAST(result.tree!, 'calculate');
        expect(loc).not.toBeNull();
        expect(loc?.name).toBe('calculate');
        expect(loc?.line).toBe(0);
    });
});

describe('findComponentDefinitionAST', () => {
    it('should find component definition location', () => {
        const text = `component WebServer {
    input string name
}`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const loc = findComponentDefinitionAST(result.tree!, 'WebServer');
        expect(loc).not.toBeNull();
        expect(loc?.name).toBe('WebServer');
        expect(loc?.line).toBe(0);
    });
});

describe('findTypeDefinitionAST', () => {
    it('should find type alias definition location', () => {
        const text = `type Region = "us-east-1" | "us-west-2"`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const loc = findTypeDefinitionAST(result.tree!, 'Region');
        expect(loc).not.toBeNull();
        expect(loc?.name).toBe('Region');
        expect(loc?.line).toBe(0);
    });
});

describe('findSchemaPropertyAST', () => {
    it('should find schema property location', () => {
        const text = `schema Config {
    string host
    number port
}`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const loc = findSchemaPropertyAST(result.tree!, 'Config', 'port');
        expect(loc).not.toBeNull();
        expect(loc?.name).toBe('port');
        expect(loc?.line).toBe(2);
    });

    it('should return null for non-existent property', () => {
        const text = `schema Config { string host }`;
        const result = parseKite(text);
        const loc = findSchemaPropertyAST(result.tree!, 'Config', 'missing');
        expect(loc).toBeNull();
    });
});

describe('findComponentInputAST', () => {
    it('should find component input location', () => {
        const text = `component WebServer {
    input string name
    input number replicas
}`;
        const result = parseKite(text);
        expect(result.tree).not.toBeNull();

        const loc = findComponentInputAST(result.tree!, 'WebServer', 'replicas');
        expect(loc).not.toBeNull();
        expect(loc?.name).toBe('replicas');
        expect(loc?.line).toBe(2);
    });

    it('should return null for non-existent input', () => {
        const text = `component WebServer { input string name }`;
        const result = parseKite(text);
        const loc = findComponentInputAST(result.tree!, 'WebServer', 'missing');
        expect(loc).toBeNull();
    });
});
