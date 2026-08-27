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
  "onfone",
)
@Injectable()
export class OnfoneKenyaHttpSmsProvider
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
    if (
      sms.sender === null
    ) {
      return {
        status:
          "FAILED",

        errorCode:
          "UNSUPPORTED_DESTINATION",

        errorMessage:
          "SMS cannot be sent to the destination.",
      };
    }

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

  private translateResponse(
    response:
      HttpRequestResult,
  ): HttpSubmissionResult {
    switch (
    response.status
    ) {
      case "SUCCESS": {
        const body =
          this.asRecord(
            response.body,
          );

        const data =
          Array.isArray(
            body?.["Data"],
          )
            ? body["Data"]
            : [];

        const firstResult =
          this.asRecord(
            data[0],
          );

        const providerMessageId =
          firstResult?.[
          "MessageId"
          ];

        return {
          status:
            "SUBMITTED",

          statusCode:
            response.statusCode,

          providerMessageId:
            typeof providerMessageId === "string"
              ? providerMessageId
              : undefined,

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

  private getApiKey(
    configuration:
      HttpConnectorConfiguration,
  ): string {
    return String(
      configuration["ApiKey"],
    );
  }

  private getClientId(
    configuration:
      HttpConnectorConfiguration,
  ): number {
    return Number(
      configuration["ClientId"],
    );
  }

  private asRecord(
    value:
      unknown,
  ): Record<
    string,
    unknown
  > | null {
    if (
      typeof value !== "object" ||
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