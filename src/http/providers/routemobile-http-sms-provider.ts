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
  "route-mobile",
)
@Injectable()
export class RouteMobileHttpSmsProvider
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
        "{USER}",
        this.getConfigValue(
          configuration,
          "username",
        ),
      )
      .replace(
        "{PASS}",
        this.getConfigValue(
          configuration,
          "password",
        ),
      )
      .replace(
        "{type}",
        this.getConfigValue(
          configuration,
          "type",
        ),
      )
      .replace(
        "{dlr}",
        this.getConfigValue(
          configuration,
          "dlr",
        ),
      )
      .replace(
        "{DEST}",
        encodeURIComponent(
          sms.destination,
        ),
      )
      .replace(
        "{SOUR}",
        encodeURIComponent(
          sms.sender,
        ),
      )
      .replace(
        "{MSG}",
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
        return this.translateRouteMobileResponse(
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

  private translateRouteMobileResponse(
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
          "ROUTEMOBILE_INVALID_RESPONSE",

        errorMessage:
          "RouteMobile returned an invalid response.",
      };
    }

    const parts =
      response.body.split("|");

    const providerStatus =
      parts[0]?.trim();

    if (
      providerStatus === "1701"
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
        providerStatus ||
        "ROUTEMOBILE_UNKNOWN_ERROR",

      errorMessage:
        `RouteMobile rejected the SMS with response code ${providerStatus ??
        "UNKNOWN"
        }.`,
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
        `RouteMobile configuration "${key}" is required.`,
      );
    }

    return value;
  }
}