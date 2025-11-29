import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    console.log('Kite Language extension is now active');

    // Register completion provider (basic autocomplete)
    const completionProvider = vscode.languages.registerCompletionItemProvider(
        'kite',
        {
            provideCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
                const completions: vscode.CompletionItem[] = [];

                // Keywords
                const keywords = [
                    'resource', 'component', 'schema', 'input', 'output',
                    'if', 'else', 'while', 'for', 'in', 'return',
                    'import', 'from', 'fun', 'var', 'type', 'init', 'this',
                    'true', 'false', 'null'
                ];

                keywords.forEach(kw => {
                    const item = new vscode.CompletionItem(kw, vscode.CompletionItemKind.Keyword);
                    completions.push(item);
                });

                // Types
                const types = ['string', 'number', 'boolean', 'any', 'object', 'void'];
                types.forEach(t => {
                    const item = new vscode.CompletionItem(t, vscode.CompletionItemKind.TypeParameter);
                    completions.push(item);
                });

                // Array types
                types.filter(t => t !== 'void').forEach(t => {
                    const item = new vscode.CompletionItem(t + '[]', vscode.CompletionItemKind.TypeParameter);
                    item.insertText = t + '[]';
                    completions.push(item);
                });

                return completions;
            }
        },
        '' // trigger on any character
    );

    context.subscriptions.push(completionProvider);

    // TODO: Add Language Server Protocol client for advanced features
    // See CLAUDE.md for implementation guide
}

export function deactivate() {
    console.log('Kite Language extension is now deactivated');
}
