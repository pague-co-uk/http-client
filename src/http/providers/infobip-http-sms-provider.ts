import {
  Injectable,
} from "@nestjs/common";

import {
  HttpClient,
} from "../http.client.js";

import type {
  HttpConnectorConfiguration,
} from "../types/http-connector-configuration.js";

import type {
  HttpRequestResult,
} from "../types/http-request-result.js";

import type {
  HttpSubmissionResult,
} from "../types/http-submission-result.js";

import type {
  OutboundSms,
} from "../types/outbound-sms.js";

import {
  HttpSmsProvider,
} from "./http-sms-provider.decorator.js";

import type {
  HttpSmsProvider as HttpSmsProviderContract,
} from "./http-sms-provider.js";

@HttpSmsProvider(
  "infobip",
)
@Injectable()
export class InfobipHttpSmsProvider
  implements HttpSmsProviderContract {
  constructor(
    private readonly http:
      HttpClient,
  ) { }

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
          messages: [
            {
              sender:
                sms.sender,

              destinations: [
                {
                  to:
                    sms.destination,
                },
              ],

              content: {
                text:
                  sms.body,
              },
            },
          ],
        },
      });

    return this.translateResponse(
      response,
    );
  }

  private translateResponse(
    response:
      HttpRequestResult,
  ): HttpSubmissionResult {
    switch (
    response.status
    ) {
      case "SUCCESS": {
        const providerMessageId =
          this.extractProviderMessageId(
            response.body,
          );

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

  private extractProviderMessageId(
    body:
      unknown,
  ): string | undefined {
    if (
      typeof body !== "object" ||
      body === null ||
      !("messages" in body)
    ) {
      return undefined;
    }

    const messages =
      body.messages;

    if (
      !Array.isArray(messages) ||
      messages.length === 0
    ) {
      return undefined;
    }

    const firstMessage =
      messages[0];

    if (
      typeof firstMessage !== "object" ||
      firstMessage === null ||
      !("messageId" in firstMessage)
    ) {
      return undefined;
    }

    return typeof firstMessage.messageId === "string"
      ? firstMessage.messageId
      : undefined;
  }
}