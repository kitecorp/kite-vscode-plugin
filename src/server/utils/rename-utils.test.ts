import { describe, it, expect } from 'vitest';
import {
    escapeRegex,
    isInComment,
    findScopeBlocks,
    findEnclosingScope,
    findComponentTypeForScope,
    findSchemaNameForScope,
    getSchemaContextAtPosition,
    findWordOccurrences,
    findWordOccurrencesInScope,
    findComponentInstantiations,
    findResourceInstantiations,
    findPropertyAssignments,
    findPropertyAccess,
    canRenameSymbol,
    isValidNewName,
} from './rename-utils';
import { KEYWORDS, TYPES } from '../constants';

describe('escapeRegex', () => {
    it('should escape special regex characters', () => {
        expect(escapeRegex('hello.world')).toBe('hello\\.world');
        expect(escapeRegex('test[0]')).toBe('test\\[0\\]');
        expect(escapeRegex('a+b*c')).toBe('a\\+b\\*c');
    });

    it('should not modify regular strings', () => {
        expect(escapeRegex('hello')).toBe('hello');
        expect(escapeRegex('myVariable123')).toBe('myVariable123');
    });
});

describe('isInComment', () => {
    it('should detect single-line comments', () => {
        const text = 'var x = 1 // this is a comment';
        expect(isInComment(text, 5)).toBe(false); // 'x'
        expect(isInComment(text, 15)).toBe(true); // inside comment
    });

    it('should detect block comments', () => {
        const text = 'var x = /* comment */ 1';
        expect(isInComment(text, 5)).toBe(false); // 'x'
        expect(isInComment(text, 12)).toBe(true); // inside comment
        expect(isInComment(text, 22)).toBe(false); // '1' after comment
    });

    it('should handle multiline block comments', () => {
        const text = `var x = 1
/* this is
   a multiline
   comment */
var y = 2`;
        expect(isInComment(text, 4)).toBe(false); // 'x'
        expect(isInComment(text, 20)).toBe(true); // inside comment
        expect(isInComment(text, 55)).toBe(false); // 'y'
    });
});

describe('findScopeBlocks', () => {
    it('should find function scopes', () => {
        const text = `
fun myFunc(string arg) number {
    var x = 1
    return x
}`;
        const scopes = findScopeBlocks(text);
        expect(scopes.length).toBe(1);
        expect(scopes[0].type).toBe('function');
    });

    it('should find component definition scopes', () => {
        const text = `
component MyComponent {
    input string name
    output string url
}`;
        const scopes = findScopeBlocks(text);
        expect(scopes.length).toBe(1);
        expect(scopes[0].type).toBe('component-def');
    });

    it('should not treat component instantiation as definition', () => {
        const text = `
component MyComponent myInstance {
    name = "test"
}`;
        const scopes = findScopeBlocks(text);
        // Should not find a component-def scope since this is an instantiation
        const compDefScopes = scopes.filter(s => s.type === 'component-def');
        expect(compDefScopes.length).toBe(0);
    });

    it('should find schema scopes', () => {
        const text = `
schema MySchema {
    string name
    number port
}`;
        const scopes = findScopeBlocks(text);
        expect(scopes.length).toBe(1);
        expect(scopes[0].type).toBe('schema');
    });

    it('should find multiple scopes', () => {
        const text = `
schema Config {
    string host
}

component Server {
    input string name
}

fun start() {
    var x = 1
}`;
        const scopes = findScopeBlocks(text);
        expect(scopes.length).toBe(3);
    });
});

describe('findEnclosingScope', () => {
    it('should find the enclosing scope for an offset', () => {
        const text = `
fun myFunc() {
    var x = 1
}`;
        const scopes = findScopeBlocks(text);
        const offset = text.indexOf('var x');
        const enclosing = findEnclosingScope(scopes, offset);
        expect(enclosing).not.toBeNull();
        expect(enclosing!.type).toBe('function');
    });

    it('should return null for offset outside any scope', () => {
        const text = `
var global = 1
fun myFunc() {
    var x = 1
}`;
        const scopes = findScopeBlocks(text);
        const offset = text.indexOf('global');
        const enclosing = findEnclosingScope(scopes, offset);
        expect(enclosing).toBeNull();
    });
});

describe('findComponentTypeForScope', () => {
    it('should find component type name for a scope', () => {
        const text = `
component WebServer {
    input string host
}`;
        const scopes = findScopeBlocks(text);
        const compScope = scopes.find(s => s.type === 'component-def');
        const typeName = findComponentTypeForScope(text, compScope!.start);
        expect(typeName).toBe('WebServer');
    });

    it('should return null for non-component scope', () => {
        const text = `
fun myFunc() {
    var x = 1
}`;
        const scopes = findScopeBlocks(text);
        const funcScope = scopes.find(s => s.type === 'function');
        const typeName = findComponentTypeForScope(text, funcScope!.start);
        expect(typeName).toBeNull();
    });
});

describe('getSchemaContextAtPosition', () => {
    it('should return schema context when inside schema', () => {
        const text = `
schema DatabaseConfig {
    string host
    number port
}`;
        const offset = text.indexOf('host');
        const context = getSchemaContextAtPosition(text, offset);
        expect(context).not.toBeNull();
        expect(context!.schemaName).toBe('DatabaseConfig');
    });

    it('should return null when outside schema', () => {
        const text = `
var x = 1
schema Config {
    string name
}`;
        const offset = text.indexOf('var x');
        const context = getSchemaContextAtPosition(text, offset);
        expect(context).toBeNull();
    });
});

describe('findWordOccurrences', () => {
    it('should find all occurrences of a word', () => {
        const text = 'var x = x + x';
        const occurrences = findWordOccurrences(text, 'x');
        expect(occurrences.length).toBe(3);
    });

    it('should not match partial words', () => {
        const text = 'var myVar = myVariable';
        const occurrences = findWordOccurrences(text, 'myVar');
        expect(occurrences.length).toBe(1);
    });

    it('should exclude occurrences in comments', () => {
        const text = 'var x = 1 // x is a variable\nvar y = x';
        const occurrences = findWordOccurrences(text, 'x');
        expect(occurrences.length).toBe(2); // Not the one in comment
    });
});

describe('findWordOccurrencesInScope', () => {
    it('should only find occurrences within scope', () => {
        const text = `
var x = 1
fun myFunc() {
    var x = 2
    return x
}
var y = x`;
        const scopes = findScopeBlocks(text);
        const funcScope = scopes.find(s => s.type === 'function')!;
        const occurrences = findWordOccurrencesInScope(text, 'x', funcScope.start, funcScope.end);
        expect(occurrences.length).toBe(2); // Only the ones inside the function
    });
});

describe('findComponentInstantiations', () => {
    it('should find component instantiations', () => {
        const text = `
component WebServer {
    input string name
}

component WebServer api {
    name = "api"
}

component WebServer web {
    name = "web"
}`;
        const instantiations = findComponentInstantiations(text, 'WebServer');
        expect(instantiations.length).toBe(2);
        expect(instantiations[0].instanceName).toBe('api');
        expect(instantiations[1].instanceName).toBe('web');
    });

    it('should not confuse definition with instantiation', () => {
        const text = `
component MyComponent {
    input string name
}`;
        const instantiations = findComponentInstantiations(text, 'MyComponent');
        expect(instantiations.length).toBe(0);
    });
});

describe('findResourceInstantiations', () => {
    it('should find resource instantiations', () => {
        const text = `
schema Config {
    string host
}

resource Config db {
    host = "localhost"
}

resource Config cache {
    host = "redis"
}`;
        const instantiations = findResourceInstantiations(text, 'Config');
        expect(instantiations.length).toBe(2);
        expect(instantiations[0].instanceName).toBe('db');
        expect(instantiations[1].instanceName).toBe('cache');
    });

    it('should handle dotted schema names', () => {
        const text = `
resource VM.Instance server {
    host = "localhost"
}`;
        const instantiations = findResourceInstantiations(text, 'VM.Instance');
        expect(instantiations.length).toBe(1);
        expect(instantiations[0].instanceName).toBe('server');
    });
});

describe('findPropertyAssignments', () => {
    it('should find property assignments in body', () => {
        const text = `
resource Config db {
    host = "localhost"
    port = 5432
    host = "override"
}`;
        const bodyStart = text.indexOf('{') + 1;
        const bodyEnd = text.lastIndexOf('}');
        const assignments = findPropertyAssignments(text, bodyStart, bodyEnd, 'host');
        expect(assignments.length).toBe(2);
    });

    it('should not match == comparisons', () => {
        const text = `
if host == "localhost" {
    host = "changed"
}`;
        const assignments = findPropertyAssignments(text, 0, text.length, 'host');
        expect(assignments.length).toBe(1); // Only the assignment, not the comparison
    });
});

describe('findPropertyAccess', () => {
    it('should find property access patterns', () => {
        const text = `
var url = server.host
var port = server.port
var other = server.host + server.host`;
        const access = findPropertyAccess(text, 'server', 'host');
        expect(access.length).toBe(3);
    });

    it('should not match in comments', () => {
        const text = `
var url = server.host // server.host is the URL
var backup = server.host`;
        const access = findPropertyAccess(text, 'server', 'host');
        expect(access.length).toBe(2); // Not the one in comment
    });
});

describe('canRenameSymbol', () => {
    it('should not allow renaming keywords', () => {
        for (const keyword of KEYWORDS) {
            const result = canRenameSymbol(keyword, `var ${keyword} = 1`, 4);
            expect(result.canRename).toBe(false);
            expect(result.reason).toBe('Cannot rename keyword');
        }
    });

    it('should not allow renaming built-in types', () => {
        for (const type of TYPES) {
            const result = canRenameSymbol(type, `var ${type} = 1`, 4);
            expect(result.canRename).toBe(false);
            expect(result.reason).toBe('Cannot rename built-in type');
        }
    });

    it('should not allow renaming decorators', () => {
        const text = '@myDecorator\nresource Config db {}';
        const offset = text.indexOf('myDecorator');
        const result = canRenameSymbol('myDecorator', text, offset);
        expect(result.canRename).toBe(false);
        expect(result.reason).toBe('Cannot rename decorator');
    });

    it('should not allow renaming inside comments', () => {
        const text = 'var x = 1 // myVar is important';
        const offset = text.indexOf('myVar');
        const result = canRenameSymbol('myVar', text, offset);
        expect(result.canRename).toBe(false);
        expect(result.reason).toBe('Cannot rename inside comment');
    });

    it('should allow renaming valid symbols', () => {
        const text = 'var myVariable = 1';
        const offset = text.indexOf('myVariable');
        const result = canRenameSymbol('myVariable', text, offset);
        expect(result.canRename).toBe(true);
    });
});

describe('isValidNewName', () => {
    it('should reject invalid identifiers', () => {
        expect(isValidNewName('123abc').valid).toBe(false);
        expect(isValidNewName('my-var').valid).toBe(false);
        expect(isValidNewName('my var').valid).toBe(false);
        expect(isValidNewName('').valid).toBe(false);
    });

    it('should reject keywords', () => {
        for (const keyword of KEYWORDS) {
            expect(isValidNewName(keyword).valid).toBe(false);
        }
    });

    it('should reject built-in types', () => {
        for (const type of TYPES) {
            expect(isValidNewName(type).valid).toBe(false);
        }
    });

    it('should accept valid identifiers', () => {
        expect(isValidNewName('myVariable').valid).toBe(true);
        expect(isValidNewName('_private').valid).toBe(true);
        expect(isValidNewName('camelCase123').valid).toBe(true);
        expect(isValidNewName('CONSTANT_VALUE').valid).toBe(true);
    });
});

describe('Scope-Aware Rename Scenarios', () => {
    it('should scope function parameters to function body', () => {
        const text = `
var name = "global"
fun greet(string name) {
    return "Hello " + name
}
var greeting = name`;

        // Find function scope
        const scopes = findScopeBlocks(text);
        const funcScope = scopes.find(s => s.type === 'function')!;

        // Find occurrences of 'name' in function scope
        const inScope = findWordOccurrencesInScope(text, 'name', funcScope.start, funcScope.end);
        expect(inScope.length).toBe(1); // Only the usage inside function body (return statement)

        // Find all occurrences
        const all = findWordOccurrences(text, 'name');
        expect(all.length).toBe(4); // global var, param, usage in func, usage after func
    });

    it('should scope component inputs/outputs to component definition', () => {
        const text = `
var name = "global"

component WebServer {
    input string name = "default"
    output string url = name
}

var serverName = name`;

        // Find component scope
        const scopes = findScopeBlocks(text);
        const compScope = scopes.find(s => s.type === 'component-def')!;

        // Find occurrences of 'name' in component scope
        const inScope = findWordOccurrencesInScope(text, 'name', compScope.start, compScope.end);
        expect(inScope.length).toBe(2); // input declaration and usage in output

        // Verify component type can be found
        const typeName = findComponentTypeForScope(text, compScope.start);
        expect(typeName).toBe('WebServer');
    });

    it('should find component instantiation property assignments', () => {
        const text = `
component WebServer {
    input string host = "localhost"
    input number port = 8080
}

component WebServer api {
    host = "api.example.com"
    port = 443
}

component WebServer web {
    host = "www.example.com"
}`;

        const instantiations = findComponentInstantiations(text, 'WebServer');
        expect(instantiations.length).toBe(2);

        // Find 'host' assignments in all instantiations
        let hostAssignments = 0;
        for (const inst of instantiations) {
            const assignments = findPropertyAssignments(text, inst.bodyStart, inst.bodyEnd, 'host');
            hostAssignments += assignments.length;
        }
        expect(hostAssignments).toBe(2);
    });

    it('should find property access on instances', () => {
        const text = `
component WebServer {
    output string endpoint = "http://localhost"
}

component WebServer api {
}

var apiUrl = api.endpoint
var doubled = api.endpoint + api.endpoint`;

        const instantiations = findComponentInstantiations(text, 'WebServer');
        expect(instantiations.length).toBe(1);
        expect(instantiations[0].instanceName).toBe('api');

        // Find property access
        const access = findPropertyAccess(text, 'api', 'endpoint');
        expect(access.length).toBe(3);
    });

    it('should handle schema property renames with resources', () => {
        const text = `
schema DatabaseConfig {
    string host
    number port = 5432
}

resource DatabaseConfig primary {
    host = "primary.db.local"
}

resource DatabaseConfig replica {
    host = "replica.db.local"
}

var primaryHost = primary.host`;

        // Find schema context
        const schemaOffset = text.indexOf('string host') + 7;
        const context = getSchemaContextAtPosition(text, schemaOffset);
        expect(context).not.toBeNull();
        expect(context!.schemaName).toBe('DatabaseConfig');

        // Find resource instantiations
        const resources = findResourceInstantiations(text, 'DatabaseConfig');
        expect(resources.length).toBe(2);

        // Find property assignments
        let totalAssignments = 0;
        for (const res of resources) {
            const assignments = findPropertyAssignments(text, res.bodyStart, res.bodyEnd, 'host');
            totalAssignments += assignments.length;
        }
        expect(totalAssignments).toBe(2);

        // Find property access
        const access = findPropertyAccess(text, 'primary', 'host');
        expect(access.length).toBe(1);
    });
});
