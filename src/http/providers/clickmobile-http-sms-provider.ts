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
  "click-mobile",
)
@Injectable()
export class ClickMobileAngolaHttpSmsProvider
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
          from:
            sms.sender,

          to:
            sms.destination,

          refId:
            sms.messageId,

          message:
            sms.body,
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
}