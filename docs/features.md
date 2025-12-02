# Kite VS Code Extension - Features Documentation

This document provides an overview of all implemented features in the Kite Language VS Code extension.

**Total: 27 features + 38 validation checks**

---

## Feature Categories

### [Core IDE Features](./FEATURES_CORE.md)

Essential IDE functionality for editing Kite files.

| # | Feature | Description |
|---|---------|-------------|
| 1 | Syntax Highlighting | TextMate grammar-based highlighting |
| 2 | Go to Definition | Navigate to symbol definitions (Ctrl+Click / F12) |
| 3 | Find References | Find all usages of a symbol (Shift+F12) |
| 4 | Autocomplete | Context-aware code completion |
| 5 | Hover Documentation | Show docs on hover |
| 6 | Signature Help | Parameter hints for function calls |
| 7 | Document Symbols | Outline view in sidebar |
| 8 | Diagnostics & Validation | Import, decorator, and name validation |
| 9 | Code Actions | Quick fixes and import management |
| 10 | Inlay Hints | Inline type and parameter hints |
| 11 | Rename Symbol | Rename across file/workspace (F2) |
| 12 | Code Formatting | Auto-format with consistent indentation |
| 13 | Type Checking | Validate type consistency |
| 14 | Unused Import Detection | Detect and remove unused imports |

### [Navigation Features](./FEATURES_NAVIGATION.md)

Features for exploring and navigating code.

| # | Feature | Description |
|---|---------|-------------|
| 15 | Document Highlight | Highlight all occurrences of symbol |
| 16 | Selection Range | Smart expand/shrink selection |
| 17 | Code Lens | Show reference counts above declarations |
| 18 | Workspace Symbols | Global symbol search (Cmd+T / Ctrl+T) |
| 19 | Semantic Tokens | Enhanced syntax highlighting via LSP |
| 20 | Folding Range | Collapse/expand code blocks |
| 21 | Go to Implementation | Find all resources/instances of a schema/component |

### [Refactoring & Editing](./FEATURES_REFACTORING.md)

Advanced editing and refactoring tools.

| # | Feature | Description |
|---|---------|-------------|
| 22 | Call Hierarchy | View incoming/outgoing function calls |
| 23 | Linked Editing Range | Simultaneous editing of related identifiers |
| 24 | Document Links | Clickable import paths |
| 25 | On Type Formatting | Auto-format as you type |
| 26 | Unused Variables | Detect unused variables, inputs, parameters |
| 27 | Go to Type Definition | Navigate to schema/component definition |

### [Diagnostics & Validation](./FEATURES_VALIDATION.md)

38 validation rules for detecting errors and code quality issues.

| Category | Count | Examples |
|----------|-------|----------|
| Error | 19 | Duplicate parameters, decorator validation, circular imports |
| Warning | 16 | Empty block, variable shadowing, infinite loop |
| Hint | 3 | Empty string check, negated comparison, implicit any |

---

## Configuration Files

### `language-configuration.json`
- Bracket matching: `()`, `[]`, `{}`
- Auto-closing pairs
- Comment toggling: `//`, `/* */`
- Folding regions
- Word pattern for identifiers

### `package.json`
- Language registration (`.kite` files)
- Grammar contribution
- Extension activation events

---

## Implementation Notes

### Declaration Cache
- `declarationCache: Map<string, Declaration[]>`
- Updated on document change
- Stores all declarations per file

### Cross-file Resolution
- `findKiteFilesInWorkspace()` - Finds all `.kite` files (cached)
- `getFileContent()` - Reads file content with caching
- `isSymbolImported()` - Checks if symbol is imported
- `extractImports()` - Parses import statements

### Block Detection
- `findEnclosingBlock()` - Finds resource/component containing cursor
- `isInsideSchemaBody()` - Checks if inside schema definition
- `isInsideComponentDefinition()` - Checks if inside component definition
- `isAfterEquals()` - Checks if in value context

### Utility Functions
- `escapeRegex()` - Escape special regex characters (text-utils.ts)
- `wordBoundaryRegex()` - Create word boundary regex (text-utils.ts)
- `isInComment()` - Check if position is inside comment (text-utils.ts)
- `findBraceEnd()` - Find matching closing brace (text-utils.ts)
- `resolveImportPath()` - Resolve import to file path (import-utils.ts)
- `findSymbolInWorkspace()` - Search symbol across files (workspace-utils.ts)

---

## All Features Complete

All planned language server features have been implemented for the Kite VS Code extension.
