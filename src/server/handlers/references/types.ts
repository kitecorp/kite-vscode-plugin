/**
 * Type definitions for the references handler.
 */

import { TextDocument } from 'vscode-languageserver-textdocument';
import { BaseContext } from '../../types';

/**
 * Context interface for dependency injection into references handler.
 * This allows the handler to access server-scoped resources without direct coupling.
 */
export interface ReferencesContext extends BaseContext {
    /** Get document by URI */
    getDocument: (uri: string) => TextDocument | undefined;
}
