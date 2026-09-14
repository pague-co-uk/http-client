import {
  Injectable,
} from "@nestjs/common";

import {
  HttpClient,
} from "../../../http.client.js";

import type {
  HttpConnectorConfiguration,
} from "../../../types/http-connector-configuration.js";

import type {
  HttpRequestResult,
} from "../../../types/http-request-result.js";

import type {
  HttpSubmissionResult,
} from "../../../types/http-submission-result.js";

import type {
  OutboundSms,
} from "../../../types/outbound-sms.js";

import type {
  HttpDeliveryReceipt,
} from "../../../types/http-delivery-receipt.js";

import {
  HttpSmsProvider,
} from "../../core/http-sms-provider.decorator.js";

import type {
  HttpSmsProvider as HttpSmsProviderContract,
} from "../../core/http-sms-provider.js";

/**
 * Register one or more provider codes that should resolve to this provider.
 *
 * Multiple codes may point to the same implementation when the provider uses
 * the same API contract across different countries, accounts, or connector
 * configurations.
 *
 * Example:
 *
 * @HttpSmsProvider(
 *   "example-kenya",
 *   "example-malawi",
 *   "example-zambia",
 * )
 */
@HttpSmsProvider(
  "example",
)
@Injectable()
export class ExampleHttpSmsProvider
  implements HttpSmsProviderContract {
  constructor(
    private readonly http:
      HttpClient,
  ) { }

  // ===========================================================================
  // Send
  // ===========================================================================

  /**
   * Submit an SMS through the provider's HTTP API.
   *
   * Provider implementations are responsible for translating the generic
   * Pague `OutboundSms` model into the provider's request format.
   *
   * The provider should:
   *
   * 1. Build the provider-specific request body from `sms`.
   * 2. Use `configuration` for the connector's endpoint, HTTP method,
   *    authentication, headers, timeouts, and provider-specific settings.
   * 3. Send the request through `HttpClient`.
   * 4. Translate the provider's HTTP/API response into a
   *    `HttpSubmissionResult`.
   *
   * Do NOT use `fetch`, Axios, or another HTTP client directly here.
   * `HttpClient` is responsible for generic HTTP concerns such as:
   *
   * - authentication
   * - headers
   * - serialization
   * - timeouts
   * - connection failures
   * - HTTP response handling
   * - logging
   * - tracing
   * - metrics
   *
   * The provider should therefore contain only provider-specific request
   * construction and response interpretation.
   *
   * `SUBMITTED` means that the provider accepted the submission. It does not
   * mean that the handset has received the message. A later DLR may change
   * the message to `DELIVERED` or `FAILED`.
   *
   * If the provider returns its own message identifier, it MUST be returned
   * as `providerMessageId`. That identifier is used later to correlate DLRs.
   */
  async send(
    connectorId: string,
    sms: OutboundSms,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<HttpSubmissionResult> {
    const response =
      await this.http.request({
        connectorId,

        configuration,

        body: {
          from:
            sms.sender,

          to:
            sms.destination,

          message:
            sms.body,
        },
      });

    return this.translateResponse(
      response,
    );
  }

  /**
   * Translate the generic `HttpClient` result into the Pague submission
   * result.
   *
   * `HttpClient` has already handled the transport-level outcome. The
   * provider's responsibility here is to interpret the provider-specific
   * response body and determine whether the message was:
   *
   * - SUBMITTED: provider accepted the message.
   * - FAILED: provider explicitly rejected the submission.
   * - UNKNOWN: the outcome cannot safely be determined.
   * - DISCONNECTED: the HTTP connection failed before a definitive response.
   *
   * IMPORTANT:
   *
   * A successful HTTP response does not automatically mean that the provider
   * accepted the SMS. Some providers return HTTP 200 with an application-level
   * error in the response body. Such provider-specific conditions must be
   * handled by the implementation.
   */
  private translateResponse(
    response:
      HttpRequestResult,
  ): HttpSubmissionResult {
    switch (
    response.status
    ) {
      case "SUCCESS":
        return {
          status:
            "SUBMITTED",

          statusCode:
            response.statusCode,

          providerResponse:
            response.body,
        };

      case "FAILED":
        return {
          status:
            "FAILED",

          statusCode:
            response.statusCode,

          errorCode:
            response.errorCode,

          errorMessage:
            response.errorMessage,
        };

      case "UNKNOWN":
        return {
          status:
            "UNKNOWN",

          errorCode:
            response.errorCode,

          errorMessage:
            response.errorMessage,
        };

      case "DISCONNECTED":
        return {
          status:
            "DISCONNECTED",

          statusCode:
            0,

          errorCode:
            "HTTP_DISCONNECTED",

          errorMessage:
            response.errorMessage,
        };
    }
  }

  // ===========================================================================
  // DLR identification
  // ===========================================================================

  /**
   * Identify the provider message ID contained in an incoming DLR payload.
   *
   * The HTTP DLR endpoint is deliberately provider-agnostic. It receives the
   * complete request payload and the provider registry asks each registered
   * provider whether it recognizes the payload.
   *
   * The implementation must:
   *
   * 1. Inspect the provider-specific payload.
   * 2. Locate the field containing the provider's message identifier.
   * 3. Return that identifier as a string.
   * 4. Return `null` when the payload is not a DLR for this provider or does
   *    not contain a usable message identifier.
   *
   * Do not perform database lookups here.
   * Do not resolve the connector here.
   * Do not publish messages here.
   *
   * This method only identifies the provider message ID.
   */
  identifyDlr(
    payload:
      Record<string, unknown>,
  ): string | null {
    return null;
  }

  // ===========================================================================
  // DLR processing
  // ===========================================================================

  /**
   * Parse a provider-specific DLR into Pague's normalized delivery receipt.
   *
   * The HTTP DLR flow is:
   *
   * Provider
   *   ↓
   * HTTP DLR endpoint
   *   ↓
   * complete provider payload
   *   ↓
   * identifyDlr()
   *   ↓
   * processDlr()
   *   ↓
   * normalized HttpDeliveryReceipt
   *   ↓
   * DeliveryReceiptPublisher
   *   ↓
   * RoutingService
   *
   * The implementation is responsible for translating the provider's
   * status values into Pague's normalized delivery status.
   *
   * For example, a provider might use:
   *
   *   "DELIVRD"  → "DELIVERED"
   *   "SUCCESS"  → "DELIVERED"
   *   "FAILED"   → "FAILED"
   *   "REJECTED" → "FAILED"
   *
   * Provider-specific intermediate statuses must NOT be incorrectly mapped
   * to `DELIVERED` or `FAILED`.
   *
   * `providerMessageId` MUST be the identifier used by the provider to
   * identify the original submitted message. It is used by the routing layer
   * to correlate the DLR with `MessageRouteAttempt.providerMessageId`.
   *
   * `rawData` should contain useful provider-specific DLR information that
   * should be retained for troubleshooting or auditing.
   *
   * Do not perform database lookups here.
   * Do not update Message or MessageRouteAttempt here.
   * Do not publish to RabbitMQ here.
   *
   * `HttpDlrService` and the routing pipeline are responsible for those
   * concerns.
   */
  async processDlr(
    payload:
      Record<string, unknown>,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<
    HttpDeliveryReceipt
  > {
    throw new Error(
      "Example HTTP SMS provider DLR processing is not implemented.",
    );
  }
}