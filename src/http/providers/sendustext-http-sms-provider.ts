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
  "sendustext",
)
@Injectable()
export class SendUsTextHttpSmsProvider
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
    const path =
      this.buildSendPath(
        configuration.sendPath,
        configuration,
        sms,
      );

    const response =
      await this.http.request({
        connectorId,

        configuration,

        method:
          "GET",

        path,
      });

    return this.translateResponse(
      response,
    );
  }

  private buildSendPath(
    template: string,
    configuration:
      HttpConnectorConfiguration,
    sms: OutboundSms,
  ): string {
    return template
      .replace(
        "{USERNAME}",
        encodeURIComponent(
          this.getConfigValue(
            configuration,
            "username",
          ),
        ),
      )
      .replace(
        "{PASSWORD}",
        encodeURIComponent(
          this.getConfigValue(
            configuration,
            "password",
          ),
        ),
      )
      .replace(
        "{MOBILE}",
        encodeURIComponent(
          sms.destination,
        ),
      )
      .replace(
        "{SENDERID}",
        encodeURIComponent(
          "1234567890",
        ),
      )
      .replace(
        "{MESSAGE}",
        encodeURIComponent(
          sms.body,
        ),
      );
  }

  private translateResponse(
    response:
      HttpRequestResult,
  ): HttpSubmissionResult {
    switch (
    response.status
    ) {
      case "SUCCESS":
        return this.translateUkResponse(
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

  private translateUkResponse(
    response: Extract<
      HttpRequestResult,
      {
        status: "SUCCESS";
      }
    >,
  ): HttpSubmissionResult {
    if (
      typeof response.body !==
      "string"
    ) {
      return {
        status:
          "UNKNOWN",

        errorCode:
          "UK_INVALID_RESPONSE",

        errorMessage:
          "UK SMS provider returned an invalid response.",
      };
    }

    const parts =
      response.body.split("|");

    if (
      parts.length > 1
    ) {
      return {
        status:
          "SUBMITTED",

        statusCode:
          response.statusCode,

        providerMessageId:
          parts[1]?.trim() ||
          undefined,

        providerResponse:
          response.body,
      };
    }

    return {
      status:
        "FAILED",

      statusCode:
        response.statusCode,

      errorCode:
        "UK_SUBMISSION_FAILED",

      errorMessage:
        response.body ||
        "UK SMS provider rejected the SMS.",
    };
  }

  private getConfigValue(
    configuration:
      HttpConnectorConfiguration,
    key:
      string,
  ): string {
    const value =
      configuration[key];

    if (
      typeof value !==
      "string"
    ) {
      throw new Error(
        `UK SMS configuration "${key}" is required.`,
      );
    }

    return value;
  }
}