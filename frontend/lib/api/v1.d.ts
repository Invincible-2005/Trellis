// AUTO-GENERATED STUB — regenerate later via `pnpm api:generate`

export interface paths {
  '/api/v1/orgs/provision': {
    post: {
      requestBody?: never;
      responses: {
        200: { content: { 'application/json': { org_id: string } } };
        403: { content: { 'application/json': { detail: { code: string; message: string } } } };
        409: { content: { 'application/json': { detail: { code: string; message: string } } } };
      };
    };
  };
  '/api/v1/auth/me': {
    get: {
      responses: {
        200: { content: { 'application/json': { user_id: string; email: string; name: string } } };
      };
    };
  };
  '/api/v1/auth/context': {
    get: {
      responses: {
        200: {
          content: {
            'application/json': {
              active_org: {
                id: string;
                name: string;
                can_open_admin: boolean;
                permissions: string[];
              };
            };
          };
        };
      };
    };
  };
}

export type webhooks = Record<string, never>;
export interface components {
  schemas: Record<string, never>;
}
export type $defs = Record<string, never>;