export type HttpMethod =
  | "GET"
  | "HEAD"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE"
  | "OPTIONS"
  | "TRACE"
  | "CONNECT";

export type HttpAuthentication =
  | {
    type: "NONE";
  }
  | {
    type: "BEARER";
    token: string;
  }
  | {
    type: "API_KEY";
    header: string;
    value: string;
  }
  | {
    type: "BASIC";
    username: string;
    password: string;
  }
  | {
    type: "CUSTOM";
    headers: Record<string, string>;
  };

export interface HttpConnectorConfiguration {
  baseUrl: string;

  sendPath: string;

  method: HttpMethod;

  authentication: HttpAuthentication;

  connectTimeout: number;

  requestTimeout: number;

  reconnectDelay: number;

  maxReconnectDelay: number;

  headers: Record<string, string>;

  /**
   * Provider-specific configuration.
   *
   * The generic HTTP client does not interpret these values.
   * Individual providers are responsible for validating and
   * consuming the values they require.
   *
   * Example:
   *
   * RouteMobile:
   * {
   *   username: "...",
   *   password: "...",
   *   type: "0",
   *   dlr: "1"
   * }
   */
  providerConfiguration:
  Record<string, unknown>;
}