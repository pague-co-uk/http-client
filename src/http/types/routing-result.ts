
export interface RoutingResult {
  messageId: string;

  attemptId: string;

  routeId: string;

  connectorId: string;

  status:
  | "SUBMITTED"
  | "FAILED"
  | "UNKNOWN"
  | "DISCONNECTED";

  providerMessageId?: string;

  errorCode?: string;

  errorMessage?: string;
}