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
  "tanzania-imart",
)
@Injectable()
export class ImartHttpSmsProvider
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
    const senderId =
      this.getSenderId(
        configuration,
        sms,
      );

    return template
      .replace(
        "{key}",
        encodeURIComponent(
          this.getConfigValue(
            configuration,
            "apiKey",
          ),
        ),
      )
      .replace(
        "{contacts}",
        encodeURIComponent(
          sms.destination,
        ),
      )
      .replace(
        "{senderid}",
        encodeURIComponent(
          senderId,
        ),
      )
      .replace(
        "{msg}",
        encodeURIComponent(
          sms.body,
        ),
      );
  }

  private getSenderId(
    configuration:
      HttpConnectorConfiguration,
    sms: OutboundSms,
  ): string {
    /*
     * The sender ID mapping should ideally be resolved before the provider
     * is called. This keeps the provider independent of client IDs.
     *
     * The configuration can contain a default sender ID and optional
     * client-specific sender mappings.
     */

    const mappings =
      configuration[
      "senderIds"
      ];

    if (
      mappings &&
      typeof mappings === "object" &&
      !Array.isArray(mappings)
    ) {
      const senderIds =
        mappings as Record<
          string,
          unknown
        >;

      const clientId =
        sms.clientId;

      if (
        clientId !== undefined &&
        typeof senderIds[
        String(clientId)
        ] === "string"
      ) {
        return senderIds[
          String(clientId)
        ] as string;
      }
    }

    return this.getConfigValue(
      configuration,
      "senderId",
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
        return this.translateImartResponse(
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

  private translateImartResponse(
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
          "IMART_INVALID_RESPONSE",

        errorMessage:
          "Tanzania iMart returned an invalid response.",
      };
    }

    if (
      response.body.includes(
        "SMS",
      )
    ) {
      return {
        status:
          "SUBMITTED",

        statusCode:
          response.statusCode,

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
        "IMART_SUBMISSION_FAILED",

      errorMessage:
        response.body ||
        "Tanzania iMart rejected the SMS.",
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
        `Tanzania iMart configuration "${key}" is required.`,
      );
    }

    return value;
  }
}