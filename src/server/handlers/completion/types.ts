/**
 * Type definitions for the completion handler.
 */

import { BlockContext, BaseContext } from '../../types';

/**
 * Context interface for dependency injection into completion handler.
 */
export interface CompletionContext extends BaseContext {
    /** Find enclosing block (resource or component) */
    findEnclosingBlock: (text: string, offset: number) => BlockContext | null;
}
