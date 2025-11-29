import * as vscode from 'vscode';
import { activateClient, deactivateClient } from './client/client';

export function activate(context: vscode.ExtensionContext) {
    console.log('Kite Language extension is now active');

    // Start the Language Server client
    activateClient(context);
}

export function deactivate(): Thenable<void> | undefined {
    console.log('Kite Language extension is now deactivated');
    return deactivateClient();
}
