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

import {
  HttpSmsProvider,
} from "../../core/http-sms-provider.decorator.js";

import type {
  HttpDeliveryReceipt,
} from "../../../types/http-delivery-receipt.js";

import type {
  HttpSmsProvider as HttpSmsProviderContract,
} from "../../core/http-sms-provider.js";

@HttpSmsProvider(
  "onfone",
)
@Injectable()
export class OnfoneKenyaHttpSmsProvider
  implements HttpSmsProviderContract {
  constructor(
    private readonly http:
      HttpClient,
  ) { }

  // ===========================================================================
  // Send
  // ===========================================================================

  /**
   * Submit an SMS through the Onfon REST API.
   *
   * Onfon expects:
   *
   * - ApiKey
   * - ClientId
   * - SenderId
   * - MessageParameters[]
   *
   * The AccessKey is an HTTP header and should be configured through the
   * generic HttpClient authentication/header configuration rather than being
   * added to this provider's request body.
   *
   * Onfon's API can return HTTP success while still reporting an application-
   * level failure through ErrorCode. Therefore the response body must be
   * inspected before declaring the message SUBMITTED.
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
          ApiKey:
            this.getApiKey(
              configuration,
            ),

          ClientId:
            this.getClientId(
              configuration,
            ),

          SenderId:
            sms.sender,

          MessageParameters: [
            {
              Number:
                sms.destination,

              Text:
                sms.body,
            },
          ],
        },
      });

    return this.translateResponse(
      response,
    );
  }

  // ===========================================================================
  // Submission response
  // ===========================================================================

  /**
   * Translate the generic HTTP result into Pague's submission result.
   *
   * Onfon's documented successful response has the following structure:
   *
   * {
   *   "ErrorCode": 0,
   *   "ErrorDescription": "Success",
   *   "Data": [
   *     {
   *       "MobileNumber": "...",
   *       "MessageId": "..."
   *     }
   *   ]
   * }
   *
   * The MessageId returned by Onfon is the provider message ID that must be
   * retained because Onfon uses the same identifier in its DLR callback.
   */
  private translateResponse(
    response:
      HttpRequestResult,
  ): HttpSubmissionResult {
    switch (
    response.status
    ) {
      case "SUCCESS":
        return this.translateSuccess(
          response,
        );

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

  private translateSuccess(
    response:
      Extract<
        HttpRequestResult,
        {
          status: "SUCCESS";
        }
      >,
  ): HttpSubmissionResult {
    const body =
      this.asRecord(
        response.body,
      );

    if (!body) {
      return {
        status:
          "UNKNOWN",

        statusCode:
          response.statusCode,

        errorCode:
          "ONFON_INVALID_RESPONSE",

        errorMessage:
          "Onfon returned a successful HTTP response with an invalid response body.",
      };
    }

    const errorCode =
      this.getStringOrNumber(
        body[
        "ErrorCode"
        ],
      );

    const errorDescription =
      this.getString(
        body[
        "ErrorDescription"
        ],
      );

    /*
     * Onfon uses ErrorCode 0 for a successful submission.
     *
     * The documentation also lists some error codes with leading zeroes,
     * such as "003" and "007", so the comparison deliberately accepts both
     * numeric 0 and string "0"/"000".
     */
    if (
      !this.isSuccessErrorCode(
        errorCode,
      )
    ) {
      return {
        status:
          "FAILED",

        statusCode:
          response.statusCode,

        errorCode:
          errorCode !== undefined
            ? String(
              errorCode,
            )
            : undefined,

        errorMessage:
          errorDescription ??
          "Onfon rejected the SMS submission.",
      };
    }

    const data =
      Array.isArray(
        body[
        "Data"
        ],
      )
        ? body[
        "Data"
        ]
        : [];

    const firstResult =
      this.asRecord(
        data[0],
      );

    const providerMessageId =
      this.getString(
        firstResult?.[
        "MessageId"
        ],
      );

    /*
     * The provider accepted the request but did not give us the identifier
     * needed to correlate a future DLR. We cannot safely mark this as a
     * normal SUBMITTED result because the DLR pipeline would have no way to
     * match the receipt to this route attempt.
     */
    if (
      !providerMessageId
    ) {
      return {
        status:
          "UNKNOWN",

        statusCode:
          response.statusCode,

        errorCode:
          "ONFON_MISSING_MESSAGE_ID",

        errorMessage:
          "Onfon accepted the submission but did not return a MessageId.",

      };
    }

    return {
      status:
        "SUBMITTED",

      statusCode:
        response.statusCode,

      providerMessageId,

      providerResponse:
        response.body,
    };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Read the Onfon API key from provider-specific configuration.
   *
   * This is intentionally not read from the generic connector configuration
   * itself. `providerConfiguration` is where provider-specific settings live.
   */
  private getApiKey(
    configuration:
      HttpConnectorConfiguration,
  ): string {
    const value =
      configuration
        .providerConfiguration[
      "ApiKey"
      ];

    if (
      typeof value !==
      "string" ||
      value.length ===
      0
    ) {
      throw new Error(
        "Onfon ApiKey is not configured.",
      );
    }

    return value;
  }

  /**
   * Read the Onfon ClientId from provider-specific configuration.
   */
  private getClientId(
    configuration:
      HttpConnectorConfiguration,
  ): number {
    const value =
      configuration
        .providerConfiguration[
      "ClientId"
      ];

    const clientId =
      Number(
        value,
      );

    if (
      !Number.isInteger(
        clientId,
      ) ||
      clientId <= 0
    ) {
      throw new Error(
        "Onfon ClientId is not configured correctly.",
      );
    }

    return clientId;
  }

  // ===========================================================================
  // DLR identification
  // ===========================================================================

  /**
   * Extract the Onfon provider message ID from a DLR payload.
   *
   * Onfon sends DLRs as GET requests with query parameters including:
   *
   * - messageId
   * - mobile
   * - status
   * - errorCode
   * - shortMessage
   * - submitDate
   * - doneDate
   *
   * `messageId` is the identifier returned when the SMS was submitted.
   */
  identifyDlr(
    payload:
      Record<string, unknown>,
  ): string | null {
    const messageId =
      this.getString(
        payload[
        "messageId"
        ],
      );

    if (
      !messageId
    ) {
      return null;
    }

    return messageId;
  }

  // ===========================================================================
  // DLR processing
  // ===========================================================================

  /**
   * Convert an Onfon DLR into Pague's normalized delivery receipt.
   *
   * This method does not perform database operations and does not publish
   * anything to RabbitMQ. It only translates the provider-specific payload.
   *
   * The resulting providerMessageId is used by the routing layer to locate
   * MessageRouteAttempt.providerMessageId.
   *
   * Onfon's public DLR documentation specifies the fields but does not
   * document the complete list of possible status values. The mappings below
   * therefore cover the terminal values used by the existing Onfon
   * integration contract while keeping unknown statuses from being
   * incorrectly classified as delivered or failed.
   */
  async processDlr(
    payload:
      Record<string, unknown>,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<
    HttpDeliveryReceipt
  > {
    /*
     * The configuration is part of the common provider contract. Onfon's DLR
     * payload does not currently require any provider-specific configuration,
     * so it is intentionally unused here.
     */
    void configuration;

    const providerMessageId =
      this.identifyDlr(
        payload,
      );

    if (
      !providerMessageId
    ) {
      throw new Error(
        "Onfon DLR does not contain a messageId.",
      );
    }

    const status =
      this.getString(
        payload[
        "status"
        ],
      );

    if (
      !status
    ) {
      throw new Error(
        "Onfon DLR does not contain a status.",
      );
    }

    const normalizedStatus =
      status
        .trim()
        .toUpperCase();

    switch (
    normalizedStatus
    ) {
      /*
       * DELIVRD is the delivery status used by the existing Onfon integration
       * example and represents successful handset delivery.
       */
      case "DELIVRD":
      case "DELIVERED":
      case "SUCCESS":
        return {
          providerMessageId,

          status:
            "DELIVERED",

          rawData:
            this.buildDlrRawData(
              payload,
            ),
        };

      /*
       * These are terminal failure states commonly represented by SMS
       * gateways. Preserve the provider's error information when available.
       */
      case "UNDELIV":
      case "UNDELIVERED":
      case "FAILED":
      case "REJECTED":
      case "EXPIRED":
        return {
          providerMessageId,

          status:
            "FAILED",

          errorCode:
            this.getString(
              payload[
              "errorCode"
              ],
            ),

          errorMessage:
            this.getString(
              payload[
              "shortMessage"
              ],
            ) ??
            `Onfon reported delivery status '${status}'.`,

          rawData:
            this.buildDlrRawData(
              payload,
            ),
        };

      /*
       * The provider has not reported a terminal outcome. Do not incorrectly
       * mark the message as delivered or failed.
       *
       * The current Pague HttpDeliveryReceipt contract only represents
       * terminal delivery outcomes, so these statuses cannot be returned as
       * a normalized receipt yet.
       */
      case "SUBMITTED":
      case "ENROUTE":
      case "BUFFERED":
      case "PENDING":
        throw new Error(
          `Onfon DLR status '${status}' is not terminal.`,
        );

      default:
        throw new Error(
          `Unknown Onfon DLR status '${status}'.`,
        );
    }
  }

  /**
   * Preserve the useful provider-specific DLR information for diagnostics
   * and troubleshooting without allowing the routing layer to depend on
   * Onfon-specific fields.
   */
  private buildDlrRawData(
    payload:
      Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      messageId:
        payload[
        "messageId"
        ],

      mobile:
        payload[
        "mobile"
        ],

      status:
        payload[
        "status"
        ],

      errorCode:
        payload[
        "errorCode"
        ],

      shortMessage:
        payload[
        "shortMessage"
        ],

      submitDate:
        payload[
        "submitDate"
        ],

      doneDate:
        payload[
        "doneDate"
        ],
    };
  }

  // ===========================================================================
  // Response helpers
  // ===========================================================================

  private isSuccessErrorCode(
    value:
      string | number | undefined,
  ): boolean {
    return (
      value === 0 ||
      value === "0" ||
      value === "000"
    );
  }

  private getString(
    value:
      unknown,
  ): string | undefined {
    return typeof value ===
      "string" &&
      value.length > 0
      ? value
      : undefined;
  }

  private getStringOrNumber(
    value:
      unknown,
  ): string | number | undefined {
    if (
      typeof value ===
      "string" ||
      typeof value ===
      "number"
    ) {
      return value;
    }

    return undefined;
  }

  private asRecord(
    value:
      unknown,
  ): Record<
    string,
    unknown
  > | null {
    if (
      typeof value !==
      "object" ||
      value === null ||
      Array.isArray(value)
    ) {
      return null;
    }

    return value as Record<
      string,
      unknown
    >;
  }
}