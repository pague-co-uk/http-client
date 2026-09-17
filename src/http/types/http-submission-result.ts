export type HttpSubmissionResult =
  | {
    status: "SUBMITTED";

    statusCode: number;

    providerMessageId?: string;

    providerResponse?: unknown;
  }
  | {
    status: "FAILED";

    statusCode?: number;

    errorCode?: string;

    errorMessage: string;

    providerResponse?: unknown;
  }
  | {
    status: "UNKNOWN";

    statusCode?: number;

    errorCode?: string;

    errorMessage: string;

    providerResponse?: unknown;
  }
  | {
    status: "DISCONNECTED";

    statusCode: 0;

    errorCode: "HTTP_DISCONNECTED";

    errorMessage: string;
  };