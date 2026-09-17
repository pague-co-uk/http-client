import {
  Injectable,
} from "@nestjs/common";

import {
  getComponentLogger,
} from "@pague-co-uk/sms-gateway-telemetry";

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
  "africastalking-cameroon",
  "africastalking-kenya",
  "africastalking-ghana",
)
@Injectable()
export class AfricasTalkingHttpSmsProvider
  implements HttpSmsProviderContract {
  private readonly logger =
    getComponentLogger(
      AfricasTalkingHttpSmsProvider.name,
    );

  constructor(
    private readonly http:
      HttpClient,
  ) { }

  // ===========================================================================
  // Send
  // ===========================================================================

  async send(
    connectorId: string,
    sms: OutboundSms,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<HttpSubmissionResult> {
    // =========================================================================
    // Configuration diagnostics
    // =========================================================================

    this.logger.info(
      {
        connectorId,

        configurationKeys:
          Object.keys(
            configuration,
          ),

        providerConfigurationKeys:
          Object.keys(
            configuration.providerConfiguration ?? {},
          ),

        providerConfigurationTypes:
          Object.fromEntries(
            Object.entries(
              configuration.providerConfiguration ?? {},
            ).map(
              ([key, value]) => [
                key,
                typeof value,
              ],
            ),
          ),

        usernamePresent:
          Boolean(
            configuration
              .providerConfiguration
            ?.["username"],
          ),

        usernameType:
          typeof configuration
            .providerConfiguration
          ?.["username"],

        authenticationType:
          configuration.authentication.type,

        authenticationHeader:
          configuration.authentication.type ===
            "API_KEY"
            ? configuration.authentication.header
            : undefined,

        baseUrl:
          configuration.baseUrl,

        sendPath:
          configuration.sendPath,

        method:
          configuration.method,

        connectTimeout:
          configuration.connectTimeout,

        requestTimeout:
          configuration.requestTimeout,

        headerNames:
          Object.keys(
            configuration.headers,
          ),
      },
      "Africa's Talking provider configuration inspected.",
    );

    // =========================================================================
    // Resolve username
    // =========================================================================

    let username: string;

    try {
      username =
        this.getUsername(
          configuration,
        );

      this.logger.info(
        {
          connectorId,

          provider:
            "africastalking",

          messageId:
            sms.messageId,

          usernameResolved:
            true,
        },
        "Africa's Talking username resolved successfully.",
      );
    } catch (error) {
      this.logger.error(
        {
          connectorId,

          provider:
            "africastalking",

          messageId:
            sms.messageId,

          providerConfigurationKeys:
            Object.keys(
              configuration.providerConfiguration ?? {},
            ),

          usernamePresent:
            Boolean(
              configuration
                .providerConfiguration
              ?.["username"],
            ),

          usernameType:
            typeof configuration
              .providerConfiguration
            ?.["username"],

          err:
            error,
        },
        "Africa's Talking username resolution failed.",
      );

      throw error;
    }

    // =========================================================================
    // Provider request
    // =========================================================================

    this.logger.info(
      {
        connectorId,

        provider:
          "africastalking",

        messageId:
          sms.messageId,

        destination:
          sms.destination,

        sender:
          sms.sender,

        encoding:
          sms.encoding,

        segmentCount:
          sms.segmentCount,

        requestMethod:
          configuration.method,

        requestPath:
          configuration.sendPath,

        requestTimeout:
          configuration.requestTimeout,

        usernameResolved:
          true,
      },
      "Africa's Talking provider request starting.",
    );

    let response:
      HttpRequestResult;

    try {
      this.logger.info(
        {
          connectorId,

          provider:
            "africastalking",

          messageId:
            sms.messageId,
        },
        "Calling HTTP client for Africa's Talking request.",
      );

      response =
        await this.http.request({
          connectorId,

          configuration,

          body: {
            username,

            message:
              sms.body,

            senderId:
              sms.sender,

            phoneNumbers: [
              sms.destination,
            ],
          },
        });

      this.logger.info(
        {
          connectorId,

          provider:
            "africastalking",

          messageId:
            sms.messageId,

          status:
            response.status,
        },
        "Africa's Talking provider HTTP request returned.",
      );
    } catch (error) {
      this.logger.error(
        {
          connectorId,

          provider:
            "africastalking",

          messageId:
            sms.messageId,

          destination:
            sms.destination,

          err:
            error,
        },
        "Africa's Talking provider request failed.",
      );

      throw error;
    }

    // =========================================================================
    // Translate response
    // =========================================================================

    this.logger.info(
      {
        connectorId,

        provider:
          "africastalking",

        messageId:
          sms.messageId,

        responseStatus:
          response.status,

      },
      "Translating Africa's Talking provider response.",
    );

    const result =
      this.translateResponse(
        response,
      );

    // =========================================================================
    // Translation result
    // =========================================================================

    this.logger.info(
      {
        connectorId,

        provider:
          "africastalking",

        messageId:
          sms.messageId,

        status:
          result.status,

        statusCode:
          result.statusCode,

        providerMessageId:
          result.status ===
            "SUBMITTED"
            ? result.providerMessageId
            : undefined,

        errorCode:
          result.status !==
            "SUBMITTED"
            ? result.errorCode
            : undefined,
      },
      "Africa's Talking provider response translated.",
    );

    return result;
  }

  // ===========================================================================
  // Response
  // ===========================================================================

  private translateResponse(
    response:
      HttpRequestResult,
  ): HttpSubmissionResult {
    this.logger.debug(
      {
        responseStatus:
          response.status,
      },
      "Translating HTTP response from Africa's Talking.",
    );

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

          statusCode:
            response.statusCode,

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
    this.logger.debug(
      {
        statusCode:
          response.statusCode,

        responseBodyType:
          typeof response.body,
      },
      "Processing successful Africa's Talking response.",
    );

    const parsed =
      this.parseSuccessResponse(
        response.body,
      );

    // =========================================================================
    // Request-level rejection
    //
    // Africa's Talking can return HTTP 201 while returning no recipients.
    // In that case, SMSMessageData.Message provides the provider's
    // explanation for why no recipient result was returned.
    //
    // Example:
    //
    // {
    //   "SMSMessageData": {
    //     "Message": "InvalidSenderId",
    //     "Recipients": []
    //   }
    // }
    // =========================================================================

    if (
      parsed.recipients.length ===
      0
    ) {
      if (
        parsed.message
      ) {
        this.logger.warn(
          {
            statusCode:
              response.statusCode,

            providerMessage:
              parsed.message,
          },
          "Africa's Talking rejected the request without returning recipient results.",
        );

        return {
          status:
            "FAILED",

          statusCode:
            response.statusCode,

          errorCode:
            "AT_REQUEST_REJECTED",

          errorMessage:
            parsed.message,

          providerResponse:
            response.body,
        };
      }

      this.logger.warn(
        {
          statusCode:
            response.statusCode,
        },
        "Africa's Talking response contained no recipients and no explanation.",
      );

      return {
        status:
          "UNKNOWN",

        statusCode:
          response.statusCode,

        errorCode:
          "AT_MISSING_RECIPIENTS",

        errorMessage:
          "Africa's Talking returned no recipient results and no explanation.",

        providerResponse:
          response.body,
      };
    }

    // =========================================================================
    // Recipient-level response
    // =========================================================================

    const recipient =
      parsed.recipients[0];

    if (
      !recipient
    ) {
      this.logger.warn(
        {
          statusCode:
            response.statusCode,

          recipientsCount:
            parsed.recipients.length,
        },
        "Africa's Talking response contained an invalid recipient result.",
      );

      return {
        status:
          "UNKNOWN",

        statusCode:
          response.statusCode,

        errorCode:
          "AT_INVALID_RESPONSE",

        errorMessage:
          "Africa's Talking returned an invalid recipient result.",

        providerResponse:
          response.body,
      };
    }

    this.logger.debug(
      {
        recipientStatus:
          recipient.status,

        recipientStatusCode:
          recipient.statusCode,

        recipientNumberPresent:
          Boolean(
            recipient.number,
          ),

        providerMessageIdPresent:
          Boolean(
            recipient.messageId,
          ),

        costPresent:
          Boolean(
            recipient.cost,
          ),

        recipientsCount:
          parsed.recipients.length,
      },
      "Africa's Talking recipient result parsed.",
    );

    // =========================================================================
    // Successful / accepted recipient
    //
    // 100 = Processed
    // 101 = Sent
    // 102 = Queued
    // =========================================================================

    if (
      this.isSuccessfulStatusCode(
        recipient.statusCode,
      )
    ) {
      if (
        !recipient.messageId
      ) {
        this.logger.warn(
          {
            statusCode:
              response.statusCode,

            recipientStatus:
              recipient.status,

            recipientStatusCode:
              recipient.statusCode,
          },
          "Africa's Talking accepted the message but returned no message ID.",
        );

        return {
          status:
            "UNKNOWN",

          statusCode:
            response.statusCode,

          errorCode:
            "AT_MISSING_MESSAGE_ID",

          errorMessage:
            "Africa's Talking accepted the message but did not return a message ID.",

          providerResponse:
            response.body,
        };
      }

      this.logger.info(
        {
          statusCode:
            response.statusCode,

          recipientStatus:
            recipient.status,

          recipientStatusCode:
            recipient.statusCode,

          providerMessageId:
            recipient.messageId,
        },
        "Africa's Talking message accepted.",
      );

      return {
        status:
          "SUBMITTED",

        statusCode:
          response.statusCode,

        providerMessageId:
          recipient.messageId,

        providerResponse:
          response.body,
      };
    }

    // =========================================================================
    // Recipient-level rejection
    // =========================================================================

    const errorCode =
      this.getRecipientErrorCode(
        recipient,
      );

    const errorMessage =
      recipient.status ??
      parsed.message ??
      "Africa's Talking rejected the message.";

    this.logger.warn(
      {
        statusCode:
          response.statusCode,

        recipientStatus:
          recipient.status,

        recipientStatusCode:
          recipient.statusCode,

        errorCode,
      },
      "Africa's Talking rejected the recipient.",
    );

    return {
      status:
        "FAILED",

      statusCode:
        response.statusCode,

      errorCode,

      errorMessage,

      providerResponse:
        response.body,
    };
  }

  // ===========================================================================
  // Parse successful Africa's Talking response
  // ===========================================================================

  private parseSuccessResponse(
    body: unknown,
  ): AfricasTalkingParsedResponse {
    if (
      !body ||
      typeof body !==
      "object" ||
      Array.isArray(body)
    ) {
      this.logger.warn(
        {
          bodyType:
            typeof body,
        },
        "Africa's Talking response body is not an object.",
      );

      return {
        message:
          undefined,

        recipients:
          [],
      };
    }

    const data =
      body as Record<
        string,
        unknown
      >;

    const messageData =
      data[
      "SMSMessageData"
      ];

    if (
      !messageData ||
      typeof messageData !==
      "object" ||
      Array.isArray(messageData)
    ) {
      this.logger.warn(
        {
          responseKeys:
            Object.keys(
              data,
            ),
        },
        "Africa's Talking response does not contain SMSMessageData.",
      );

      return {
        message:
          undefined,

        recipients:
          [],
      };
    }

    const messageDataObject =
      messageData as Record<
        string,
        unknown
      >;

    const message =
      this.getString(
        messageDataObject[
        "Message"
        ],
      );

    const recipientsValue =
      messageDataObject[
      "Recipients"
      ];

    this.logger.debug(
      {
        messageDataKeys:
          Object.keys(
            messageDataObject,
          ),

        messagePresent:
          Boolean(
            message,
          ),

        recipientsType:
          typeof recipientsValue,

        recipientsIsArray:
          Array.isArray(
            recipientsValue,
          ),

        recipientsLength:
          Array.isArray(
            recipientsValue,
          )
            ? recipientsValue.length
            : undefined,
      },
      "Africa's Talking response fields inspected.",
    );

    if (
      !Array.isArray(
        recipientsValue,
      )
    ) {
      this.logger.warn(
        {
          messageDataKeys:
            Object.keys(
              messageDataObject,
            ),
        },
        "Africa's Talking Recipients field is not an array.",
      );

      return {
        message,

        recipients:
          [],
      };
    }

    const recipients =
      recipientsValue
        .map(
          (value) =>
            this.parseRecipient(
              value,
            ),
        )
        .filter(
          (
            recipient,
          ): recipient is AfricasTalkingRecipient =>
            recipient !== null,
        );

    return {
      message,

      recipients,
    };
  }

  // ===========================================================================
  // Parse recipient
  // ===========================================================================

  private parseRecipient(
    value: unknown,
  ): AfricasTalkingRecipient | null {
    if (
      !value ||
      typeof value !==
      "object" ||
      Array.isArray(value)
    ) {
      this.logger.warn(
        {
          recipientType:
            typeof value,
        },
        "Africa's Talking recipient is invalid.",
      );

      return null;
    }

    const data =
      value as Record<
        string,
        unknown
      >;

    this.logger.debug(
      {
        recipientKeys:
          Object.keys(
            data,
          ),
      },
      "Africa's Talking recipient fields received.",
    );

    return {
      statusCode:
        this.getNumber(
          data[
          "statusCode"
          ],
        ),

      number:
        this.getString(
          data[
          "number"
          ],
        ),

      status:
        this.getString(
          data[
          "status"
          ],
        ),

      cost:
        this.getString(
          data[
          "cost"
          ],
        ),

      messageId:
        this.getString(
          data[
          "messageId"
          ],
        ),
    };
  }

  // ===========================================================================
  // Africa's Talking recipient status
  // ===========================================================================

  private isSuccessfulStatusCode(
    statusCode:
      number | undefined,
  ): boolean {
    return (
      statusCode ===
      100 ||
      statusCode ===
      101 ||
      statusCode ===
      102
    );
  }

  private getRecipientErrorCode(
    recipient:
      AfricasTalkingRecipient,
  ): string {
    switch (
    recipient.statusCode
    ) {
      case 401:
        return "AT_RISK_HOLD";

      case 402:
        return "AT_INVALID_SENDER_ID";

      case 403:
        return "AT_INVALID_PHONE_NUMBER";

      case 404:
        return "AT_UNSUPPORTED_NUMBER_TYPE";

      case 405:
        return "AT_INSUFFICIENT_BALANCE";

      case 406:
        return "AT_USER_IN_BLACKLIST";

      case 407:
        return "AT_COULD_NOT_ROUTE";

      case 409:
        return "AT_DO_NOT_DISTURB_REJECTION";

      case 500:
        return "AT_INTERNAL_SERVER_ERROR";

      case 501:
        return "AT_GATEWAY_ERROR";

      case 502:
        return "AT_REJECTED_BY_GATEWAY";

      default:
        return "AT_RECIPIENT_REJECTED";
    }
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  private getUsername(
    configuration:
      HttpConnectorConfiguration,
  ): string {
    const providerConfiguration =
      configuration.providerConfiguration;

    this.logger.debug(
      {
        providerConfigurationType:
          typeof providerConfiguration,

        providerConfigurationKeys:
          Object.keys(
            providerConfiguration ?? {},
          ),

        usernamePresent:
          Boolean(
            providerConfiguration?.[
            "username"
            ],
          ),

        usernameType:
          typeof providerConfiguration?.[
          "username"
          ],
      },
      "Inspecting Africa's Talking username configuration.",
    );

    const username =
      providerConfiguration[
      "username"
      ];

    if (
      typeof username !==
      "string" ||
      username.length ===
      0
    ) {
      throw new Error(
        "Africa's Talking username is not configured.",
      );
    }

    return username;
  }

  // ===========================================================================
  // Type helpers
  // ===========================================================================

  private getString(
    value: unknown,
  ): string | undefined {
    return typeof value ===
      "string"
      ? value
      : undefined;
  }

  private getNumber(
    value: unknown,
  ): number | undefined {
    return typeof value ===
      "number"
      ? value
      : undefined;
  }

  // ===========================================================================
  // DLR
  // ===========================================================================

  identifyDlr(
    payload:
      Record<string, unknown>,
  ): string | null {
    const id =
      payload[
      "id"
      ];

    if (
      typeof id !==
      "string" ||
      id.length ===
      0
    ) {
      return null;
    }

    return id;
  }

  async processDlr(
    payload:
      Record<string, unknown>,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<
    HttpDeliveryReceipt
  > {
    const providerMessageId =
      this.identifyDlr(
        payload,
      );

    if (
      !providerMessageId
    ) {
      throw new Error(
        "Africa's Talking DLR does not contain a message ID.",
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
        "Africa's Talking DLR does not contain a status.",
      );
    }

    switch (
    status
    ) {
      case "Success":
        return {
          providerMessageId,

          status:
            "DELIVERED",

          rawData:
            this.buildDlrRawData(
              payload,
            ),
        };

      case "Failed":
      case "Rejected":
      case "AbsentSubscriber":
      case "Expired":
        return {
          providerMessageId,

          status:
            "FAILED",

          errorCode:
            this.getString(
              payload[
              "failureReason"
              ],
            ),

          errorMessage:
            this.getDlrErrorMessage(
              status,
              payload,
            ),

          rawData:
            this.buildDlrRawData(
              payload,
            ),
        };

      case "Sent":
      case "Submitted":
      case "Buffered":
        throw new Error(
          `Africa's Talking DLR status '${status}' is not terminal.`,
        );

      default:
        throw new Error(
          `Unknown Africa's Talking DLR status '${status}'.`,
        );
    }
  }

  private getDlrErrorMessage(
    status: string,
    payload:
      Record<string, unknown>,
  ): string {
    const failureReason =
      this.getString(
        payload[
        "failureReason"
        ],
      );

    if (
      failureReason
    ) {
      return failureReason;
    }

    switch (
    status
    ) {
      case "Rejected":
        return "Africa's Talking rejected the message.";

      case "AbsentSubscriber":
        return "The subscriber was unreachable on the mobile network.";

      case "Expired":
        return "The message expired before it could be delivered.";

      case "Failed":
        return "Africa's Talking could not deliver the message.";

      default:
        return "Africa's Talking reported message delivery failure.";
    }
  }

  private buildDlrRawData(
    payload:
      Record<string, unknown>,
  ): Record<string, unknown> {
    return {
      id:
        payload[
        "id"
        ],

      status:
        payload[
        "status"
        ],

      phoneNumber:
        payload[
        "phoneNumber"
        ],

      networkCode:
        payload[
        "networkCode"
        ],

      failureReason:
        payload[
        "failureReason"
        ],

      retryCount:
        payload[
        "retryCount"
        ],
    };
  }
}

// =============================================================================
// Africa's Talking response types
// =============================================================================

interface AfricasTalkingParsedResponse {
  message?: string;

  recipients:
  AfricasTalkingRecipient[];
}

interface AfricasTalkingRecipient {
  statusCode?: number;

  number?: string;

  status?: string;

  cost?: string;

  messageId?: string;
}