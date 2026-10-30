import type { Context } from '@deepseek-ai/cordis';
/** Document a later panel can open. */
export type AgenteroOpenerKind = 'paper' | 'note';
/** Open one document id. The host does not register openers in this step. */
export type AgenteroOpener = (id: string) => void;
/** Browser service other Agentero panels reach through `ctx.get('agentero')`. */
export interface AgenteroClient {
    /**
     * Replace the opener for one kind.
     * @param kind - Document kind.
     * @param opener - Called by {@link AgenteroClient.open}.
     * @returns Disposer that removes this opener when it is still current.
     */
    registerOpener(kind: AgenteroOpenerKind, opener: AgenteroOpener): () => void;
    /**
     * Open a document when an opener is registered.
     * @param kind - Document kind.
     * @param id - Document id.
     * @returns False when no opener is registered for `kind`.
     */
    open(kind: AgenteroOpenerKind, id: string): boolean;
}
/** Owner props for the notes column beside a PDF page. */
export interface PdfNotesOwner {
    /** Vault-relative paper directory, for example `papers/1706.03762`. */
    paperPath: string;
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface SlotMap {
        /**
         * Single notes column declared by the PDF panel.
         * The notes plugin fills it. An empty slot leaves the page full width.
         */
        'agentero.pdf.notes': {
            kind: 'single';
            scope: 'root';
            owner: PdfNotesOwner;
        };
    }
}
declare module '@deepseek-ai/cordis' {
    interface Context {
        /** Agentero document openers. Panels register later. */
        agentero: AgenteroClient;
    }
}
/** Browser plugin name. The service key is the same name. */
export declare const name = "agentero";
/** This entry provides `agentero` and waits on no other service. */
export declare const inject: readonly string[];
/**
 * Provide the `agentero` service. Openers stay empty until a later step.
 * @param ctx - Browser plugin context.
 */
export declare function apply(ctx: Context): void;
