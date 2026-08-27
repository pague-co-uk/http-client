import type {
  HttpConnectorConfiguration,
} from "../types/http-connector-configuration.js";

import type {
  HttpSubmissionResult,
} from "../types/http-submission-result.js";

import type {
  OutboundSms,
} from "../types/outbound-sms.js";

export interface HttpSmsProvider {
  send(
    connectorId: string,
    sms: OutboundSms,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<HttpSubmissionResult>;
}