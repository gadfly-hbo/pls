declare module "hono" {
  interface ContextVariableMap {
    workspaceId: string;
    requestId: string;
  }
}

export {};
