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
      },
      "Africa's Talking provider request starting.",
    );

    let response:
      HttpRequestResult;

    try {
      response =
        await this.http.request({
          connectorId,

          configuration,

          body: {
            username:
              this.getUsername(
                configuration,
              ),

            to:
              sms.destination,

            message:
              sms.body,

            senderId:
              sms.sender,
          },
        });
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

    const result =
      this.translateResponse(
        response,
      );

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
    const recipient =
      this.getFirstRecipient(
        response.body,
      );

    if (
      !recipient
    ) {
      return {
        status:
          "UNKNOWN",

        statusCode:
          response.statusCode,

        errorCode:
          "AT_MISSING_RECIPIENT",

        errorMessage:
          "Africa's Talking returned a successful response without a recipient result.",
      };
    }

    if (
      recipient.status !==
      "Success"
    ) {
      return {
        status:
          "FAILED",

        statusCode:
          response.statusCode,

        errorCode:
          recipient.statusCode !==
            undefined
            ? String(
              recipient.statusCode,
            )
            : undefined,

        errorMessage:
          recipient.status ??
          "Africa's Talking rejected the message.",
      };
    }

    if (
      !recipient.messageId
    ) {
      return {
        status:
          "UNKNOWN",

        statusCode:
          response.statusCode,

        errorCode:
          "AT_MISSING_MESSAGE_ID",

        errorMessage:
          "Africa's Talking accepted the message but did not return a message ID.",
      };
    }

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

  private getFirstRecipient(
    body: unknown,
  ): AfricasTalkingRecipient | null {
    if (
      !body ||
      typeof body !==
      "object"
    ) {
      return null;
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
      "object"
    ) {
      return null;
    }

    const recipients =
      (
        messageData as Record<
          string,
          unknown
        >
      )[
      "Recipients"
      ];

    if (
      !Array.isArray(
        recipients,
      ) ||
      recipients.length ===
      0
    ) {
      return null;
    }

    const recipient =
      recipients[0];

    if (
      !recipient ||
      typeof recipient !==
      "object"
    ) {
      return null;
    }

    const dataItem =
      recipient as Record<
        string,
        unknown
      >;

    return {
      statusCode:
        this.getNumber(
          dataItem[
          "statusCode"
          ],
        ),

      number:
        this.getString(
          dataItem[
          "number"
          ],
        ),

      status:
        this.getString(
          dataItem[
          "status"
          ],
        ),

      cost:
        this.getString(
          dataItem[
          "cost"
          ],
        ),

      messageId:
        this.getString(
          dataItem[
          "messageId"
          ],
        ),
    };
  }

  // ===========================================================================
  // Configuration
  // ===========================================================================

  private getUsername(
    configuration:
      HttpConnectorConfiguration,
  ): string {
    const username =
      configuration
        .providerConfiguration[
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

interface AfricasTalkingRecipient {
  statusCode?: number;

  number?: string;

  status?: string;

  cost?: string;

  messageId?: string;
}