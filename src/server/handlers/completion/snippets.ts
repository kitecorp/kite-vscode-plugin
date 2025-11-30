/**
 * Snippet definitions for the Kite language.
 * Provides code templates for common patterns.
 */

import { CompletionItem, CompletionItemKind, InsertTextFormat, MarkupKind } from 'vscode-languageserver/node';

export interface SnippetDefinition {
    label: string;
    prefix: string;
    body: string;
    description: string;
    detail: string;
    sortOrder: number;
    context?: 'top-level' | 'component-body' | 'any';
}

/**
 * Snippet definitions for common Kite patterns
 */
export const SNIPPETS: SnippetDefinition[] = [
    // Schema snippets
    {
        label: 'schema',
        prefix: 'schema',
        body: `schema \${1:Name} {
    \${2:string} \${3:property}
    $0
}`,
        description: 'Define a new schema (data structure)',
        detail: 'Schema Definition',
        sortOrder: 0,
        context: 'top-level',
    },
    {
        label: 'schema with defaults',
        prefix: 'schemad',
        body: `schema \${1:Name} {
    string \${2:name} = "\${3:default}"
    number \${4:port} = \${5:8080}
    boolean \${6:enabled} = \${7:true}
    $0
}`,
        description: 'Schema with default values',
        detail: 'Schema with Defaults',
        sortOrder: 1,
        context: 'top-level',
    },

    // Component snippets
    {
        label: 'component',
        prefix: 'component',
        body: `component \${1:Name} {
    input \${2:string} \${3:name}
    output \${4:string} \${5:result}
    $0
}`,
        description: 'Define a new component with inputs and outputs',
        detail: 'Component Definition',
        sortOrder: 2,
        context: 'top-level',
    },
    {
        label: 'component instance',
        prefix: 'compinst',
        body: `component \${1:ComponentType} \${2:instanceName} {
    \${3:property} = \${4:value}
    $0
}`,
        description: 'Create a component instance',
        detail: 'Component Instantiation',
        sortOrder: 3,
        context: 'top-level',
    },

    // Resource snippets
    {
        label: 'resource',
        prefix: 'resource',
        body: `resource \${1:SchemaType} \${2:name} {
    \${3:property} = \${4:value}
    $0
}`,
        description: 'Create a resource instance',
        detail: 'Resource Declaration',
        sortOrder: 4,
        context: 'top-level',
    },
    {
        label: 'resource with tags',
        prefix: 'resourcet',
        body: `@tags({ Environment: "\${1:prod}", Team: "\${2:platform}" })
resource \${3:SchemaType} \${4:name} {
    \${5:property} = \${6:value}
    $0
}`,
        description: 'Resource with cloud tags',
        detail: 'Resource with Tags',
        sortOrder: 5,
        context: 'top-level',
    },

    // Function snippets
    {
        label: 'function',
        prefix: 'fun',
        body: `fun \${1:name}(\${2:type} \${3:param}) \${4:returnType} {
    $0
    return \${5:result}
}`,
        description: 'Define a function',
        detail: 'Function Declaration',
        sortOrder: 6,
        context: 'top-level',
    },
    {
        label: 'function void',
        prefix: 'funv',
        body: `fun \${1:name}(\${2:type} \${3:param}) {
    $0
}`,
        description: 'Define a function without return type',
        detail: 'Void Function',
        sortOrder: 7,
        context: 'top-level',
    },

    // Import snippets
    {
        label: 'import all',
        prefix: 'import',
        body: `import * from "\${1:filename}.kite"`,
        description: 'Import all exports from a file',
        detail: 'Wildcard Import',
        sortOrder: 8,
        context: 'top-level',
    },
    {
        label: 'import named',
        prefix: 'importn',
        body: `import \${1:Symbol} from "\${2:filename}.kite"`,
        description: 'Import specific symbol from a file',
        detail: 'Named Import',
        sortOrder: 9,
        context: 'top-level',
    },

    // Control flow snippets
    {
        label: 'if',
        prefix: 'if',
        body: `if (\${1:condition}) {
    $0
}`,
        description: 'If statement',
        detail: 'Conditional',
        sortOrder: 10,
        context: 'any',
    },
    {
        label: 'if-else',
        prefix: 'ife',
        body: `if (\${1:condition}) {
    $2
} else {
    $0
}`,
        description: 'If-else statement',
        detail: 'Conditional with Else',
        sortOrder: 11,
        context: 'any',
    },
    {
        label: 'for',
        prefix: 'for',
        body: `for (\${1:item} in \${2:items}) {
    $0
}`,
        description: 'For loop',
        detail: 'For Loop',
        sortOrder: 12,
        context: 'any',
    },
    {
        label: 'while',
        prefix: 'while',
        body: `while (\${1:condition}) {
    $0
}`,
        description: 'While loop',
        detail: 'While Loop',
        sortOrder: 13,
        context: 'any',
    },

    // Variable snippets
    {
        label: 'var',
        prefix: 'var',
        body: `var \${1:name} = \${2:value}`,
        description: 'Variable declaration with inferred type',
        detail: 'Variable',
        sortOrder: 14,
        context: 'any',
    },
    {
        label: 'var typed',
        prefix: 'vart',
        body: `var \${1:type} \${2:name} = \${3:value}`,
        description: 'Variable declaration with explicit type',
        detail: 'Typed Variable',
        sortOrder: 15,
        context: 'any',
    },

    // Input/Output snippets (for component bodies)
    {
        label: 'input',
        prefix: 'input',
        body: `input \${1:string} \${2:name}\${3: = \${4:default}}`,
        description: 'Component input declaration',
        detail: 'Input',
        sortOrder: 16,
        context: 'component-body',
    },
    {
        label: 'output',
        prefix: 'output',
        body: `output \${1:string} \${2:name}\${3: = \${4:value}}`,
        description: 'Component output declaration',
        detail: 'Output',
        sortOrder: 17,
        context: 'component-body',
    },

    // Type alias snippet
    {
        label: 'type',
        prefix: 'type',
        body: `type \${1:Name} = \${2:"option1"} | \${3:"option2"}`,
        description: 'Type alias (union type)',
        detail: 'Type Alias',
        sortOrder: 18,
        context: 'top-level',
    },

];

/**
 * Get snippet completions filtered by context
 */
export function getSnippetCompletions(context: 'top-level' | 'component-body' | 'any' = 'top-level'): CompletionItem[] {
    return SNIPPETS
        .filter(s => s.context === 'any' || s.context === context || context === 'any')
        .map((snippet, index) => ({
            label: snippet.label,
            kind: CompletionItemKind.Snippet,
            detail: snippet.detail,
            documentation: {
                kind: MarkupKind.Markdown,
                value: `${snippet.description}\n\n\`\`\`kite\n${snippet.body.replace(/\$\{\d+:([^}]+)\}/g, '$1').replace(/\$\d+/g, '')}\n\`\`\``
            },
            insertText: snippet.body,
            insertTextFormat: InsertTextFormat.Snippet,
            sortText: '0' + String(snippet.sortOrder).padStart(2, '0'), // Snippets first
            filterText: snippet.prefix,
        }));
}

/**
 * Get a specific snippet by prefix
 */
export function getSnippetByPrefix(prefix: string): SnippetDefinition | undefined {
    return SNIPPETS.find(s => s.prefix === prefix);
}
