import type { MainRegistrar, WorkspaceContext } from '@citadel-app/core';

export async function activateMain(registrar: MainRegistrar<any>, workspace: WorkspaceContext | null) {
    // Plugin relies entirely on Citadel Core IPCs for backend database persistence.
    // No custom SQLite instances required.
}
