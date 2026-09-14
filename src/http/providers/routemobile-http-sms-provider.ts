import {
  Injectable,
} from "@nestjs/common";

import {
  getComponentLogger,
  recordException,
} from "@pague-co-uk/sms-gateway-telemetry";

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
  HttpDeliveryReceipt,
  HttpDeliveryReceiptStatus,
} from "../types/http-delivery-receipt.js";

import type {
  OutboundSms,
} from "../types/outbound-sms.js";

import {
  HttpSmsProvider,
} from "./http-sms-provider.decorator.js";

import type {
  HttpSmsProvider as HttpSmsProviderContract,
} from "./http-sms-provider.js";

interface RouteMobileProviderConfiguration {
  username: string;
  password: string;
  type: string;
  dlr: string;
}

interface RouteMobileDlrPayload {
  sSender?: unknown;
  sMobileNo?: unknown;
  sStatus?: unknown;
  dtSubmit?: unknown;
  dtDone?: unknown;
  sMessageId?: unknown;
  iCostPerSms?: unknown;
  iCharge?: unknown;
  iMCCMNC?: unknown;
  iErrCode?: unknown;
  sTagName?: unknown;
  sUdf1?: unknown;
  sUdf2?: unknown;
}

interface RouteMobileDlrRawData {
  sourceAddress?: string;
  destinationAddress?: string;
  providerStatus?: string;
  submitTime?: string;
  doneTime?: string;
  costPerSms?: string;
  charge?: string;
  mccMnc?: string;
  errorCode?: string;
  tagName?: string;
  udf1?: string;
  udf2?: string;
}

@HttpSmsProvider(
  "route-mobile",
)
@Injectable()
export class RouteMobileHttpSmsProvider implements
  HttpSmsProviderContract<RouteMobileDlrRawData> {
  private readonly logger =
    getComponentLogger(
      "route-mobile-http-provider",
    );

  constructor(
    private readonly http:
      HttpClient,
  ) { }

  // ===========================================================================
  // Delivery receipt identification
  // ===========================================================================

  identifyDlr(
    payload: Record<string, unknown>,
  ): string | null {
    try {
      const providerMessageId =
        this.getOptionalDlrString(
          payload.sMessageId,
        );

      if (!providerMessageId) {
        return null;
      }

      return providerMessageId;
    } catch (error) {
      recordException(error);

      this.logger.error(
        {
          error:
            this.serializeError(
              error,
            ),
        },
        "Failed to identify RouteMobile delivery receipt.",
      );

      throw error;
    }
  }

  // ===========================================================================
  // Delivery receipt processing
  // ===========================================================================

  async processDlr(
    payload: Record<string, unknown>,
    configuration:
      HttpConnectorConfiguration,
  ): Promise<
    HttpDeliveryReceipt<RouteMobileDlrRawData>
  > {
    try {
      const dlr =
        this.getDlrPayload(
          payload,
        );

      const providerMessageId =
        this.getRequiredDlrString(
          dlr.sMessageId,
          "sMessageId",
        );

      const providerStatus =
        this.getRequiredDlrString(
          dlr.sStatus,
          "sStatus",
        );

      const status =
        this.translateDlrStatus(
          providerStatus,
        );

      const errorCode =
        this.getDlrErrorCode(
          dlr.iErrCode,
        );

      const rawData:
        RouteMobileDlrRawData = {
        sourceAddress:
          this.getOptionalDlrString(
            dlr.sSender,
          ),

        destinationAddress:
          this.getOptionalDlrString(
            dlr.sMobileNo,
          ),

        providerStatus,

        submitTime:
          this.getOptionalDlrString(
            dlr.dtSubmit,
          ),

        doneTime:
          this.getOptionalDlrString(
            dlr.dtDone,
          ),

        costPerSms:
          this.getOptionalDlrString(
            dlr.iCostPerSms,
          ),

        charge:
          this.getOptionalDlrString(
            dlr.iCharge,
          ),

        mccMnc:
          this.getOptionalDlrString(
            dlr.iMCCMNC,
          ),

        errorCode,

        tagName:
          this.getOptionalDlrString(
            dlr.sTagName,
          ),

        udf1:
          this.getOptionalDlrString(
            dlr.sUdf1,
          ),

        udf2:
          this.getOptionalDlrString(
            dlr.sUdf2,
          ),
      };

      this.logger.info(
        {
          providerMessageId,

          providerStatus,

          status,

          errorCode,

          sourceAddress:
            rawData.sourceAddress,

          destinationAddress:
            rawData.destinationAddress,
        },
        "RouteMobile delivery receipt normalized.",
      );

      return {
        providerMessageId,

        status,

        ...(errorCode
          ? {
            errorCode,
          }
          : {}),

        rawData,
      };
    } catch (error) {
      recordException(error);

      this.logger.error(
        {
          error:
            this.serializeError(
              error,
            ),
        },
        "Failed to process RouteMobile delivery receipt.",
      );

      throw error;
    }
  }

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
    // Debug: configuration received by provider
    // =========================================================================

    this.logger.debug(
      {
        connectorId,

        configuration:
          this.sanitizeConfigurationForDebug(
            configuration,
          ),
      },
      "RouteMobile provider received connector configuration.",
    );

    // =========================================================================
    // Resolve provider-specific configuration
    // =========================================================================

    let providerConfiguration:
      RouteMobileProviderConfiguration;

    try {
      providerConfiguration =
        this.getProviderConfiguration(
          configuration,
        );
    } catch (error) {
      recordException(error);

      this.logger.error(
        {
          connectorId,

          configuration:
            this.sanitizeConfigurationForDebug(
              configuration,
            ),

          error:
            this.serializeError(
              error,
            ),
        },
        "Invalid RouteMobile provider configuration.",
      );

      throw error;
    }

    // =========================================================================
    // Build request path
    // =========================================================================

    let path: string;

    try {
      path =
        this.buildSendPath(
          configuration.sendPath,
          providerConfiguration,
          sms,
        );
    } catch (error) {
      recordException(error);

      this.logger.error(
        {
          connectorId,

          destination:
            sms.destination,

          sender:
            sms.sender,

          configuration:
            this.sanitizeConfigurationForDebug(
              configuration,
            ),

          error:
            this.serializeError(
              error,
            ),
        },
        "Failed to build RouteMobile request.",
      );

      throw error;
    }

    // =========================================================================
    // Send HTTP request
    // =========================================================================

    this.logger.debug(
      {
        connectorId,

        destination:
          sms.destination,

        sender:
          sms.sender,

        method:
          "GET",

        path:
          this.sanitizePath(
            path,
          ),
      },
      "Sending request to RouteMobile.",
    );

    try {
      const response =
        await this.http.request({
          connectorId,

          configuration,

          method:
            "GET",

          path,
        });

      this.logger.debug(
        {
          connectorId,

          destination:
            sms.destination,

          sender:
            sms.sender,

          status:
            response.status,

          ...(response.status ===
            "SUCCESS"
            ? {
              statusCode:
                response.statusCode,
            }
            : {}),

          ...(response.status ===
            "FAILED"
            ? {
              statusCode:
                response.statusCode,

              errorCode:
                response.errorCode,

              errorMessage:
                response.errorMessage,
            }
            : {}),

          ...(response.status ===
            "UNKNOWN"
            ? {
              errorCode:
                response.errorCode,

              errorMessage:
                response.errorMessage,
            }
            : {}),

          ...(response.status ===
            "DISCONNECTED"
            ? {
              errorCode:
                response.errorCode,

              errorMessage:
                response.errorMessage,
            }
            : {}),
        },
        "RouteMobile HTTP request completed.",
      );

      return this.translateResponse(
        response,
      );
    } catch (error) {
      recordException(error);

      this.logger.error(
        {
          connectorId,

          destination:
            sms.destination,

          sender:
            sms.sender,

          method:
            "GET",

          path:
            this.sanitizePath(
              path,
            ),

          error:
            this.serializeError(
              error,
            ),
        },
        "RouteMobile HTTP request threw an exception.",
      );

      throw error;
    }
  }

  // ===========================================================================
  // RouteMobile DLR payload
  // ===========================================================================

  private getDlrPayload(
    payload: Record<string, unknown>,
  ): RouteMobileDlrPayload {
    return payload as RouteMobileDlrPayload;
  }

  private getRequiredDlrString(
    value: unknown,
    fieldName: string,
  ): string {
    if (
      typeof value !==
      "string" ||
      value.trim().length ===
      0
    ) {
      throw new Error(
        `RouteMobile DLR field "${fieldName}" is required.`,
      );
    }

    return value.trim();
  }

  private getOptionalDlrString(
    value: unknown,
  ): string | undefined {
    if (
      value === undefined ||
      value === null
    ) {
      return undefined;
    }

    if (
      typeof value ===
      "string"
    ) {
      const trimmed =
        value.trim();

      return trimmed.length > 0
        ? trimmed
        : undefined;
    }

    return String(value);
  }

  // ===========================================================================
  // RouteMobile DLR status translation
  // ===========================================================================

  private translateDlrStatus(
    status: string,
  ): HttpDeliveryReceiptStatus {
    switch (
    status
      .trim()
      .toUpperCase()
    ) {
      case "DELIVRD":
        return "DELIVERED";

      case "EXPIRED":
      case "DELETED":
      case "UNDELIV":
      case "REJECTD":
        return "FAILED";

      case "UNKNOWN":
      case "ACKED":
      case "ENROUTE":
      case "ACCEPTED":
        return "FAILED";

      default:
        this.logger.warn(
          {
            providerStatus:
              status,
          },
          "RouteMobile returned an unrecognized delivery status.",
        );

        return "UNKNOWN";
    }
  }

  // ===========================================================================
  // RouteMobile DLR error code
  // ===========================================================================

  private getDlrErrorCode(
    value: unknown,
  ): string | undefined {
    if (
      value === undefined ||
      value === null
    ) {
      return undefined;
    }

    const errorCode =
      String(value).trim();

    if (
      errorCode.length === 0 ||
      errorCode === "0"
    ) {
      return undefined;
    }

    return errorCode;
  }

  // ===========================================================================
  // Provider configuration
  // ===========================================================================

  private getProviderConfiguration(
    configuration:
      HttpConnectorConfiguration,
  ): RouteMobileProviderConfiguration {
    const value =
      configuration.providerConfiguration;

    if (
      !value ||
      typeof value !==
      "object" ||
      Array.isArray(value)
    ) {
      throw new Error(
        "RouteMobile provider configuration is missing or invalid.",
      );
    }

    const username =
      value.username;

    if (
      typeof username !==
      "string" ||
      username.length ===
      0
    ) {
      throw new Error(
        'RouteMobile configuration "username" is required.',
      );
    }

    const password =
      value.password;

    if (
      typeof password !==
      "string" ||
      password.length ===
      0
    ) {
      throw new Error(
        'RouteMobile configuration "password" is required.',
      );
    }

    const type =
      value.type;

    if (
      typeof type !==
      "string"
    ) {
      throw new Error(
        'RouteMobile configuration "type" is required.',
      );
    }

    const dlr =
      value.dlr;

    if (
      typeof dlr !==
      "string"
    ) {
      throw new Error(
        'RouteMobile configuration "dlr" is required.',
      );
    }

    return {
      username,
      password,
      type,
      dlr,
    };
  }

  // ===========================================================================
  // Request path
  // ===========================================================================

  private buildSendPath(
    template: string,
    configuration:
      RouteMobileProviderConfiguration,
    sms: OutboundSms,
  ): string {
    return template
      .replace(
        "{USER}",
        configuration.username,
      )
      .replace(
        "{PASS}",
        configuration.password,
      )
      .replace(
        "{type}",
        configuration.type,
      )
      .replace(
        "{dlr}",
        configuration.dlr,
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

  // ===========================================================================
  // Provider response translation
  // ===========================================================================

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

  // ===========================================================================
  // RouteMobile response translation
  // ===========================================================================

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
      providerStatus ===
      "1701"
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
        `RouteMobile rejected the SMS with response code ${providerStatus ?? "UNKNOWN"}.`,
    };
  }

  // ===========================================================================
  // Debug configuration sanitization
  // ===========================================================================

  private sanitizeConfigurationForDebug(
    configuration:
      HttpConnectorConfiguration,
  ): Record<
    string,
    unknown
  > {
    const providerConfiguration =
      configuration.providerConfiguration;

    return {
      baseUrl:
        configuration.baseUrl,

      sendPath:
        this.sanitizePath(
          configuration.sendPath,
        ),

      method:
        configuration.method,

      authentication:
        this.sanitizeAuthentication(
          configuration.authentication,
        ),

      connectTimeout:
        configuration.connectTimeout,

      requestTimeout:
        configuration.requestTimeout,

      reconnectDelay:
        configuration.reconnectDelay,

      maxReconnectDelay:
        configuration.maxReconnectDelay,

      headers:
        configuration.headers,

      providerConfiguration:
        providerConfiguration &&
          typeof providerConfiguration ===
          "object"
          ? {
            ...providerConfiguration,

            username:
              typeof providerConfiguration.username ===
                "string"
                ? "***"
                : providerConfiguration.username,

            password:
              typeof providerConfiguration.password ===
                "string"
                ? "***"
                : providerConfiguration.password,
          }
          : providerConfiguration,
    };
  }

  private sanitizeAuthentication(
    authentication:
      HttpConnectorConfiguration["authentication"],
  ): Record<
    string,
    unknown
  > {
    switch (
    authentication.type
    ) {
      case "NONE":
        return {
          type:
            "NONE",
        };

      case "BEARER":
        return {
          type:
            "BEARER",

          token:
            "***",
        };

      case "API_KEY":
        return {
          type:
            "API_KEY",

          header:
            authentication.header,

          value:
            "***",
        };

      case "BASIC":
        return {
          type:
            "BASIC",

          username:
            "***",

          password:
            "***",
        };

      case "CUSTOM":
        return {
          type:
            "CUSTOM",

          headers:
            Object.fromEntries(
              Object.keys(
                authentication.headers,
              ).map(
                (key) => [
                  key,
                  "***",
                ],
              ),
            ),
        };
    }
  }

  // ===========================================================================
  // Error serialization
  // ===========================================================================

  private serializeError(
    error: unknown,
  ): {
    name: string;
    message: string;
    stack?: string;
    cause?: unknown;
  } {
    if (
      error instanceof Error
    ) {
      return {
        name:
          error.name,

        message:
          error.message,

        stack:
          error.stack,

        cause:
          this.serializeCause(
            error.cause,
          ),
      };
    }

    return {
      name:
        "UnknownError",

      message:
        String(error),
    };
  }

  private serializeCause(
    cause: unknown,
  ): unknown {
    if (
      cause instanceof Error
    ) {
      return {
        name:
          cause.name,

        message:
          cause.message,

        stack:
          cause.stack,

        cause:
          this.serializeCause(
            cause.cause,
          ),
      };
    }

    if (
      cause === undefined
    ) {
      return undefined;
    }

    if (
      typeof cause ===
      "object" &&
      cause !== null
    ) {
      try {
        return JSON.parse(
          JSON.stringify(
            cause,
          ),
        );
      } catch {
        return String(
          cause,
        );
      }
    }

    return cause;
  }

  // ===========================================================================
  // Path sanitization
  // ===========================================================================

  private sanitizePath(
    path: string,
  ): string {
    return path
      .replace(
        /([?&]username=)[^&]*/i,
        "$1***",
      )
      .replace(
        /([?&]password=)[^&]*/i,
        "$1***",
      )
      .replace(
        /([?&]message=)[^&]*/i,
        "$1***",
      );
  }
}