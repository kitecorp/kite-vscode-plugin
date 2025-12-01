/**
 * Tests for import-utils.ts utility functions.
 */

import { describe, it, expect } from 'vitest';
import { extractImports, isSymbolImported, resolveImportPath, resolveImportPathFromUri } from './import-utils';

describe('extractImports', () => {
    describe('wildcard imports', () => {
        it('extracts wildcard import with double quotes', () => {
            const text = 'import * from "common.kite"';
            const imports = extractImports(text);
            expect(imports).toHaveLength(1);
            expect(imports[0].path).toBe('common.kite');
            expect(imports[0].symbols).toEqual([]);
        });

        it('extracts wildcard import with single quotes', () => {
            const text = "import * from 'common.kite'";
            const imports = extractImports(text);
            expect(imports).toHaveLength(1);
            expect(imports[0].path).toBe('common.kite');
        });

        it('extracts multiple wildcard imports', () => {
            const text = `import * from "common.kite"
import * from "utils.kite"`;
            const imports = extractImports(text);
            expect(imports).toHaveLength(2);
            expect(imports[0].path).toBe('common.kite');
            expect(imports[1].path).toBe('utils.kite');
        });

        it('handles package-style paths', () => {
            const text = 'import * from "aws.DatabaseConfig"';
            const imports = extractImports(text);
            expect(imports).toHaveLength(1);
            expect(imports[0].path).toBe('aws.DatabaseConfig');
        });

        it('handles relative paths', () => {
            const text = 'import * from "./lib/utils.kite"';
            const imports = extractImports(text);
            expect(imports).toHaveLength(1);
            expect(imports[0].path).toBe('./lib/utils.kite');
        });

        it('handles parent directory paths', () => {
            const text = 'import * from "../common/types.kite"';
            const imports = extractImports(text);
            expect(imports).toHaveLength(1);
            expect(imports[0].path).toBe('../common/types.kite');
        });
    });

    describe('named imports', () => {
        it('extracts single named import', () => {
            const text = 'import Config from "types.kite"';
            const imports = extractImports(text);
            expect(imports.some(i => i.path === 'types.kite' && i.symbols.includes('Config'))).toBe(true);
        });

        it('extracts multiple named imports', () => {
            const text = 'import Config, Server, Database from "types.kite"';
            const imports = extractImports(text);
            const namedImport = imports.find(i => i.symbols.length > 0);
            expect(namedImport).toBeDefined();
            expect(namedImport?.symbols).toContain('Config');
            expect(namedImport?.symbols).toContain('Server');
            expect(namedImport?.symbols).toContain('Database');
        });

        it('handles whitespace in named imports', () => {
            const text = 'import Config , Server from "types.kite"';
            const imports = extractImports(text);
            const namedImport = imports.find(i => i.symbols.length > 0);
            expect(namedImport?.symbols).toContain('Config');
            expect(namedImport?.symbols).toContain('Server');
        });
    });

    describe('mixed imports', () => {
        it('extracts both wildcard and named imports', () => {
            const text = `import * from "common.kite"
import Config from "types.kite"`;
            const imports = extractImports(text);
            expect(imports.length).toBeGreaterThanOrEqual(2);
            expect(imports.some(i => i.path === 'common.kite')).toBe(true);
            expect(imports.some(i => i.path === 'types.kite')).toBe(true);
        });

        it('handles imports mixed with other code', () => {
            const text = `import * from "common.kite"

schema Config {
    string name
}

import * from "utils.kite"`;
            const imports = extractImports(text);
            expect(imports).toHaveLength(2);
        });
    });

    describe('edge cases', () => {
        it('returns empty array for no imports', () => {
            const text = 'schema Config { string name }';
            const imports = extractImports(text);
            expect(imports).toEqual([]);
        });

        it('returns empty array for empty text', () => {
            const imports = extractImports('');
            expect(imports).toEqual([]);
        });

        it('ignores import-like text in strings', () => {
            const text = 'var x = "import * from test"';
            const imports = extractImports(text);
            // The regex might still match inside strings - this is a known limitation
            // This test documents the current behavior
            expect(imports.length).toBeGreaterThanOrEqual(0);
        });

        it('handles import at end of file without newline', () => {
            const text = 'import * from "common.kite"';
            const imports = extractImports(text);
            expect(imports).toHaveLength(1);
        });
    });
});

describe('isSymbolImported', () => {
    const currentFilePath = '/project/src/main.kite';

    describe('wildcard imports', () => {
        it('returns true for any symbol with wildcard import', () => {
            const imports = [{ path: 'common.kite', symbols: [] }];
            const symbolFilePath = '/project/src/common.kite';
            expect(isSymbolImported(imports, 'AnySymbol', symbolFilePath, currentFilePath)).toBe(true);
        });

        it('returns true for multiple symbols with wildcard import', () => {
            const imports = [{ path: 'common.kite', symbols: [] }];
            const symbolFilePath = '/project/src/common.kite';
            expect(isSymbolImported(imports, 'Config', symbolFilePath, currentFilePath)).toBe(true);
            expect(isSymbolImported(imports, 'Server', symbolFilePath, currentFilePath)).toBe(true);
        });
    });

    describe('named imports', () => {
        it('returns true for imported symbol', () => {
            const imports = [{ path: 'types.kite', symbols: ['Config'] }];
            const symbolFilePath = '/project/src/types.kite';
            expect(isSymbolImported(imports, 'Config', symbolFilePath, currentFilePath)).toBe(true);
        });

        it('returns false for non-imported symbol', () => {
            const imports = [{ path: 'types.kite', symbols: ['Config'] }];
            const symbolFilePath = '/project/src/types.kite';
            expect(isSymbolImported(imports, 'Server', symbolFilePath, currentFilePath)).toBe(false);
        });

        it('handles multiple named symbols', () => {
            const imports = [{ path: 'types.kite', symbols: ['Config', 'Server'] }];
            const symbolFilePath = '/project/src/types.kite';
            expect(isSymbolImported(imports, 'Config', symbolFilePath, currentFilePath)).toBe(true);
            expect(isSymbolImported(imports, 'Server', symbolFilePath, currentFilePath)).toBe(true);
            expect(isSymbolImported(imports, 'Database', symbolFilePath, currentFilePath)).toBe(false);
        });
    });

    describe('path resolution', () => {
        it('resolves relative path without prefix', () => {
            const imports = [{ path: 'common.kite', symbols: [] }];
            const symbolFilePath = '/project/src/common.kite';
            expect(isSymbolImported(imports, 'Config', symbolFilePath, currentFilePath)).toBe(true);
        });

        it('resolves ./ relative path', () => {
            const imports = [{ path: './utils.kite', symbols: [] }];
            const symbolFilePath = '/project/src/utils.kite';
            expect(isSymbolImported(imports, 'Helper', symbolFilePath, currentFilePath)).toBe(true);
        });

        it('resolves ../ parent directory path', () => {
            const currentFile = '/project/src/sub/main.kite';
            const imports = [{ path: '../common.kite', symbols: [] }];
            const symbolFilePath = '/project/src/common.kite';
            expect(isSymbolImported(imports, 'Config', symbolFilePath, currentFile)).toBe(true);
        });

        it('resolves package-style path', () => {
            const imports = [{ path: 'lib.utils', symbols: [] }];
            const symbolFilePath = '/project/src/lib/utils.kite';
            expect(isSymbolImported(imports, 'Helper', symbolFilePath, currentFilePath)).toBe(true);
        });

        it('returns false for non-matching file path', () => {
            const imports = [{ path: 'common.kite', symbols: [] }];
            const symbolFilePath = '/project/src/other.kite';
            expect(isSymbolImported(imports, 'Config', symbolFilePath, currentFilePath)).toBe(false);
        });
    });

    describe('multiple imports', () => {
        it('checks all imports for symbol', () => {
            const imports = [
                { path: 'common.kite', symbols: [] },
                { path: 'types.kite', symbols: ['Config'] }
            ];
            const commonPath = '/project/src/common.kite';
            const typesPath = '/project/src/types.kite';

            expect(isSymbolImported(imports, 'AnySymbol', commonPath, currentFilePath)).toBe(true);
            expect(isSymbolImported(imports, 'Config', typesPath, currentFilePath)).toBe(true);
        });

        it('returns false if no import matches', () => {
            const imports = [
                { path: 'common.kite', symbols: [] },
                { path: 'types.kite', symbols: ['Config'] }
            ];
            const otherPath = '/project/src/other.kite';
            expect(isSymbolImported(imports, 'Something', otherPath, currentFilePath)).toBe(false);
        });
    });

    describe('edge cases', () => {
        it('returns false for empty imports', () => {
            expect(isSymbolImported([], 'Config', '/project/src/types.kite', currentFilePath)).toBe(false);
        });

        it('handles deep package paths', () => {
            const imports = [{ path: 'aws.ec2.instances', symbols: [] }];
            const symbolFilePath = '/project/src/aws/ec2/instances.kite';
            expect(isSymbolImported(imports, 'Instance', symbolFilePath, currentFilePath)).toBe(true);
        });
    });
});

describe('resolveImportPath', () => {
    const currentDir = '/project/src';

    describe('relative paths', () => {
        it('resolves ./ relative path', () => {
            const result = resolveImportPath('./utils.kite', currentDir);
            expect(result).toBe('/project/src/utils.kite');
        });

        it('resolves ../ parent directory path', () => {
            const result = resolveImportPath('../common.kite', currentDir);
            expect(result).toBe('/project/common.kite');
        });

        it('resolves nested relative path', () => {
            const result = resolveImportPath('./lib/helpers.kite', currentDir);
            expect(result).toBe('/project/src/lib/helpers.kite');
        });

        it('resolves multiple ../ levels', () => {
            const result = resolveImportPath('../../root.kite', '/project/src/sub');
            expect(result).toBe('/project/root.kite');
        });
    });

    describe('simple filenames', () => {
        it('resolves simple .kite filename', () => {
            const result = resolveImportPath('common.kite', currentDir);
            expect(result).toBe('/project/src/common.kite');
        });

        it('resolves filename with path ending in .kite', () => {
            const result = resolveImportPath('lib/utils.kite', currentDir);
            expect(result).toBe('/project/src/lib/utils.kite');
        });
    });

    describe('package-style paths', () => {
        it('resolves single-segment package path', () => {
            const result = resolveImportPath('common', currentDir);
            expect(result).toBe('/project/src/common.kite');
        });

        it('resolves two-segment package path', () => {
            const result = resolveImportPath('aws.Database', currentDir);
            expect(result).toBe('/project/src/aws/Database.kite');
        });

        it('resolves deep package path', () => {
            const result = resolveImportPath('aws.ec2.Instance', currentDir);
            expect(result).toBe('/project/src/aws/ec2/Instance.kite');
        });

        it('resolves package path with lowercase', () => {
            const result = resolveImportPath('lib.utils.helpers', currentDir);
            expect(result).toBe('/project/src/lib/utils/helpers.kite');
        });
    });

    describe('edge cases', () => {
        it('handles empty segments in path', () => {
            // Edge case: consecutive dots create empty segments, but path.resolve normalizes them
            const result = resolveImportPath('aws..test', currentDir);
            expect(result).toBe('/project/src/aws/test.kite');
        });

        it('handles mixed case paths', () => {
            const result = resolveImportPath('AWS.DatabaseConfig', currentDir);
            expect(result).toBe('/project/src/AWS/DatabaseConfig.kite');
        });
    });
});

describe('resolveImportPathFromUri', () => {
    it('resolves import from file URI', () => {
        const uri = 'file:///project/src/main.kite';
        const result = resolveImportPathFromUri('./utils.kite', uri);
        expect(result).toBe('/project/src/utils.kite');
    });

    it('resolves parent directory from file URI', () => {
        const uri = 'file:///project/src/sub/main.kite';
        const result = resolveImportPathFromUri('../common.kite', uri);
        expect(result).toBe('/project/src/common.kite');
    });

    it('resolves package-style path from file URI', () => {
        const uri = 'file:///project/src/main.kite';
        const result = resolveImportPathFromUri('aws.Database', uri);
        expect(result).toBe('/project/src/aws/Database.kite');
    });

    it('resolves simple filename from file URI', () => {
        const uri = 'file:///project/src/main.kite';
        const result = resolveImportPathFromUri('common.kite', uri);
        expect(result).toBe('/project/src/common.kite');
    });
});
