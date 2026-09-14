import type {
  HttpConnectorConfiguration,
} from "../types/http-connector-configuration.js";

import type {
  HttpDeliveryReceipt,
} from "../types/http-delivery-receipt.js";

import type {
  HttpSubmissionResult,
} from "../types/http-submission-result.js";

import type {
  OutboundSms,
} from "../types/outbound-sms.js";

export interface HttpSmsProvider<
  TRawData = Record<string, unknown>,
> {
  send(
    connectorId: string,
    sms: OutboundSms,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<HttpSubmissionResult>;

  identifyDlr(
    payload: Record<string, unknown>,
  ): string | null;

  processDlr(
    payload: Record<string, unknown>,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<
    HttpDeliveryReceipt<TRawData>
  >;
}