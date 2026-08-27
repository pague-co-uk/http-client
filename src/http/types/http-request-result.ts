export type HttpRequestResult =
  | {
    status: "SUCCESS";

    statusCode: number;

    headers: Record<string, string>;

    body?: unknown;
  }
  | {
    status: "FAILED";

    statusCode?: number;

    headers?: Record<string, string>;

    body?: unknown;

    errorCode?: string;

    errorMessage: string;
  }
  | {
    status: "UNKNOWN";

    errorCode?: string;

    errorMessage: string;
  }
  | {
    status: "DISCONNECTED";

    errorCode: "HTTP_DISCONNECTED";

    errorMessage: string;
  };