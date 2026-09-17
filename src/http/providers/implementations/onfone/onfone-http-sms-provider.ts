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

import {
  getComponentLogger,
} from "@pague-co-uk/sms-gateway-telemetry";

@HttpSmsProvider(
  "onfone",
)
@Injectable()
export class OnfoneKenyaHttpSmsProvider
  implements HttpSmsProviderContract {
  private readonly logger =
    getComponentLogger(
      "OnfoneKenyaHttpSmsProvider",
    );

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
   * The AccessKey is an HTTP header and is handled by the generic HttpClient
   * authentication configuration.
   *
   * Onfon's documented request also supports:
   *
   * - IsUnicode
   * - IsFlash
   * - ScheduleDateTime
   *
   * Pague sends immediate SMS messages, so ScheduleDateTime is intentionally
   * omitted.
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
          SenderId:
            sms.sender,

          IsUnicode:
            this.isUnicode(
              sms,
            ),

          IsFlash:
            false,

          MessageParameters: [
            {
              Number:
                sms.destination,

              Text:
                sms.body,
            },
          ],

          ApiKey:
            this.getApiKey(
              configuration,
            ),

          ClientId:
            this.getClientId(
              configuration,
            ),
        },
      });

    return this.translateResponse(
      response,
    );
  }

  // ===========================================================================
  // Submission response
  // ===========================================================================

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

          providerResponse:
            response.body,
        };

      case "UNKNOWN":
        return {
          status:
            "UNKNOWN",

          statusCode:
            response.statusCode,

          errorCode:
            response.errorCode,

          errorMessage:
            response.errorMessage,

          providerResponse:
            response.body,
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
  // Successful HTTP response
  // ===========================================================================

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

    /*
     * Temporary diagnostic logging while validating the actual Onfon
     * response structure.
     *
     * This can be removed once the provider integration has been verified.
     */
    this.logger.debug(
      {
        provider:
          "onfone",

        statusCode:
          response.statusCode,

        responseBody:
          response.body,
      },
      "Onfon submission response received.",
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

        providerResponse:
          response.body,
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
     * Onfon's top-level ErrorCode describes whether the API request itself
     * was accepted for processing.
     *
     * A value of 0 does NOT necessarily mean that every individual SMS was
     * accepted. Individual message results contain their own:
     *
     * - MessageErrorCode
     * - MessageErrorDescription
     * - MessageId
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
          this.buildErrorCode(
            errorCode,
          ),

        errorMessage:
          errorDescription ??
          "Onfon rejected the SMS submission.",

        providerResponse:
          response.body,
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

    /*
     * Diagnostic logging of the fields used to translate the individual
     * message results.
     */
    this.logger.debug(
      {
        provider:
          "onfone",

        errorCode,

        errorDescription,

        dataLength:
          data.length,

        data,
      },
      "Onfon submission response translated.",
    );

    const results =
      data
        .map(
          (
            item,
          ) =>
            this.parseSubmissionResult(
              item,
            ),
        )
        .filter(
          (
            item,
          ): item is OnfoneSubmissionResult =>
            item !== null,
        );

    if (
      results.length ===
      0
    ) {
      return {
        status:
          "UNKNOWN",

        statusCode:
          response.statusCode,

        errorCode:
          "ONFON_MISSING_RESULT",

        errorMessage:
          "Onfon accepted the SMS submission but returned no submission result.",

        providerResponse:
          response.body,
      };
    }

    /*
     * Onfon can return HTTP 200 and top-level ErrorCode 0 while an individual
     * message has still failed.
     *
     * Example:
     *
     * MessageErrorCode: 401
     * MessageErrorDescription:
     *   "Value filter failed for user [adcconnect] (source_address filter mismatch)."
     *
     * Therefore the per-message error must be checked before looking for a
     * MessageId.
     */
    const failedResult =
      results.find(
        (
          item,
        ) =>
          item.messageErrorCode !==
          undefined &&
          !this.isSuccessErrorCode(
            item.messageErrorCode,
          ),
      );

    if (
      failedResult
    ) {
      return {
        status:
          "FAILED",

        statusCode:
          response.statusCode,

        errorCode:
          this.buildErrorCode(
            failedResult.messageErrorCode,
          ),

        errorMessage:
          failedResult.messageErrorDescription ??
          "Onfon rejected the SMS submission.",

        providerResponse:
          response.body,
      };
    }

    /*
     * Pague currently submits one recipient per route attempt.
     *
     * Find the first successful result that contains a provider MessageId.
     */
    const result =
      results.find(
        (
          item,
        ) =>
          Boolean(
            item.messageId,
          ),
      );

    if (
      !result ||
      !result.messageId
    ) {
      return {
        status:
          "UNKNOWN",

        statusCode:
          response.statusCode,

        errorCode:
          "ONFON_MISSING_MESSAGE_ID",

        errorMessage:
          "Onfon accepted the SMS submission but did not return a MessageId.",

        providerResponse:
          response.body,
      };
    }

    return {
      status:
        "SUBMITTED",

      statusCode:
        response.statusCode,

      providerMessageId:
        result.messageId,

      providerResponse:
        response.body,
    };
  }

  // ===========================================================================
  // Parse Onfon submission result
  // ===========================================================================

  private parseSubmissionResult(
    value:
      unknown,
  ): OnfoneSubmissionResult | null {
    const data =
      this.asRecord(
        value,
      );

    if (!data) {
      return null;
    }

    return {
      mobileNumber:
        this.getString(
          data[
          "MobileNumber"
          ],
        ),

      messageId:
        this.getString(
          data[
          "MessageId"
          ],
        ),

      messageErrorCode:
        this.getStringOrNumber(
          data[
          "MessageErrorCode"
          ],
        ),

      messageErrorDescription:
        this.getString(
          data[
          "MessageErrorDescription"
          ],
        ),
    };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  /**
   * Read the Onfon API key from provider-specific configuration.
   *
   * This is different from AccessKey:
   *
   * - ApiKey is part of the JSON request body.
   * - AccessKey is an HTTP request header and is handled by HttpClient.
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
      value.trim().length ===
      0
    ) {
      throw new Error(
        "Onfon ApiKey is not configured.",
      );
    }

    return value.trim();
  }

  /**
   * Read the Onfon ClientId from provider-specific configuration.
   *
   * Onfon documents ClientId as a String.
   */
  private getClientId(
    configuration:
      HttpConnectorConfiguration,
  ): string {
    const value =
      configuration
        .providerConfiguration[
      "ClientId"
      ];

    if (
      typeof value !==
      "string" ||
      value.trim().length ===
      0
    ) {
      throw new Error(
        "Onfon ClientId is not configured.",
      );
    }

    return value.trim();
  }

  // ===========================================================================
  // Encoding
  // ===========================================================================

  /**
   * Onfon's request contract exposes IsUnicode as a boolean.
   *
   * Pague's OutboundSms already carries the resolved message encoding, so
   * Unicode handling is derived from that rather than being separately
   * configured for the connector.
   */
  private isUnicode(
    sms:
      OutboundSms,
  ): boolean {
    return (
      sms.encoding ===
      "UCS2"
    );
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
   */
  async processDlr(
    payload:
      Record<string, unknown>,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<
    HttpDeliveryReceipt
  > {
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
    if (
      typeof value ===
      "number"
    ) {
      return value ===
        0;
    }

    if (
      typeof value ===
      "string"
    ) {
      return (
        value.trim() ===
        "0"
      );
    }

    return false;
  }

  private buildErrorCode(
    value:
      string | number | undefined,
  ): string {
    if (
      value ===
      undefined ||
      value ===
      null
    ) {
      return "ONFON_REQUEST_REJECTED";
    }

    const normalized =
      String(
        value,
      )
        .trim();

    if (
      normalized.length ===
      0
    ) {
      return "ONFON_REQUEST_REJECTED";
    }

    return `ONFON_${normalized}`;
  }

  private getString(
    value:
      unknown,
  ): string | undefined {
    return typeof value ===
      "string" &&
      value.trim().length >
      0
      ? value.trim()
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
      value ===
      null ||
      Array.isArray(
        value,
      )
    ) {
      return null;
    }

    return value as Record<
      string,
      unknown
    >;
  }
}

// =============================================================================
// Onfon response types
// =============================================================================

interface OnfoneSubmissionResult {
  mobileNumber?: string;

  messageId?: string;

  messageErrorCode?: string | number;

  messageErrorDescription?: string;
}