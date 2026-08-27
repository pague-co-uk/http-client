import {
  Injectable,
} from "@nestjs/common";

import {
  getComponentLogger,
  recordException,
  withSpan,
} from "@pague-co-uk/sms-gateway-telemetry";

import type {
  HttpAuthentication,
  HttpConnectorConfiguration,
  HttpMethod,
} from "./types/http-connector-configuration.js";

import type {
  HttpRequestResult,
} from "./types/http-request-result.js";

export type HttpRequestBody =
  | string
  | Record<string, unknown>
  | unknown[]
  | null
  | undefined;

export interface HttpRequest {
  connectorId: string;

  configuration:
  HttpConnectorConfiguration;

  path?: string;

  method?: HttpMethod;

  headers?: Record<string, string>;

  body?: HttpRequestBody;
}

@Injectable()
export class HttpClient {
  private readonly logger =
    getComponentLogger(
      HttpClient.name,
    );

  // ===========================================================================
  // Request
  // ===========================================================================

  async request(
    request: HttpRequest,
  ): Promise<HttpRequestResult> {
    return withSpan(
      "HttpClient.request",
      async (span) => {
        const {
          connectorId,
          configuration,
        } = request;

        const method =
          request.method ??
          configuration.method;

        const path =
          request.path ??
          configuration.sendPath;

        const url =
          this.buildUrl(
            configuration.baseUrl,
            path,
          );

        const sanitizedUrl =
          this.sanitizeUrl(
            url,
          );

        span.setAttributes({
          "http.connector_id":
            connectorId,

          "http.request.method":
            method,

          "http.request.url":
            sanitizedUrl,
        });

        this.logger.debug(
          {
            connectorId,

            method,

            url: sanitizedUrl,
          },
          "Executing HTTP connector request.",
        );

        const headers =
          this.buildHeaders(
            configuration,
            request.headers,
          );

        const body =
          this.serializeBody(
            request.body,
            headers,
          );

        const controller =
          new AbortController();

        const timeout =
          setTimeout(
            () => {
              controller.abort();
            },
            configuration.requestTimeout,
          );

        const startedAt =
          Date.now();

        try {
          const response =
            await fetch(
              url,
              {
                method,

                headers,

                body,

                signal:
                  controller.signal,
              },
            );

          const duration =
            Date.now() -
            startedAt;

          const responseHeaders =
            this.extractHeaders(
              response.headers,
            );

          const responseBody =
            await this.readResponseBody(
              response,
              responseHeaders,
            );

          span.setAttributes({
            "http.response.status_code":
              response.status,

            "http.request.duration_ms":
              duration,
          });

          // ===================================================================
          // HTTP success
          // ===================================================================

          if (
            response.ok
          ) {
            this.logger.info(
              {
                connectorId,

                method,

                url: sanitizedUrl,

                statusCode:
                  response.status,

                duration,
              },
              "HTTP connector request completed successfully.",
            );

            return {
              status:
                "SUCCESS",

              statusCode:
                response.status,

              headers:
                responseHeaders,

              body:
                responseBody,
            };
          }

          // ===================================================================
          // HTTP failure
          // ===================================================================

          this.logger.warn(
            {
              connectorId,

              method,

              url: sanitizedUrl,

              statusCode:
                response.status,

              duration,
            },
            "HTTP connector returned a non-success response.",
          );

          return {
            status:
              "FAILED",

            statusCode:
              response.status,

            headers:
              responseHeaders,

            body:
              responseBody,

            errorCode:
              `HTTP_${response.status}`,

            errorMessage:
              this.getHttpErrorMessage(
                response.status,
                responseBody,
              ),
          };
        } catch (error) {
          recordException(
            error,
          );

          const aborted =
            controller.signal.aborted;

          const errorMessage =
            this.getErrorMessage(
              error,
            );

          span.setAttributes({
            "http.request.failed":
              true,

            "http.request.aborted":
              aborted,
          });

          // ===================================================================
          // Request timeout
          // ===================================================================

          /*
           * A timeout does not tell us whether the provider received or
           * processed the request.
           *
           * Therefore the outcome is UNKNOWN.
           */
          if (
            aborted
          ) {
            this.logger.error(
              {
                connectorId,

                method,

                url: sanitizedUrl,

                timeout:
                  configuration.requestTimeout,
              },
              "HTTP connector request timed out; outcome is unknown.",
            );

            return {
              status:
                "UNKNOWN",

              errorCode:
                "HTTP_REQUEST_TIMEOUT",

              errorMessage:
                "HTTP request timed out before a response was received.",
            };
          }

          // ===================================================================
          // Network / connection failure
          // ===================================================================

          /*
           * No HTTP response was received because the HTTP connection could
           * not be established or was lost before a response was available.
           */
          this.logger.error(
            {
              connectorId,

              method,

              url: sanitizedUrl,

              err:
                error,
            },
            "HTTP connector request failed.",
          );

          return {
            status:
              "DISCONNECTED",

            errorCode:
              "HTTP_DISCONNECTED",

            errorMessage,
          };
        } finally {
          clearTimeout(
            timeout,
          );
        }
      },
    );
  }

  // ===========================================================================
  // URL
  // ===========================================================================

  private buildUrl(
    baseUrl: string,
    path: string,
  ): string {
    return new URL(
      path,
      baseUrl,
    ).toString();
  }

  // ===========================================================================
  // Headers
  // ===========================================================================

  private buildHeaders(
    configuration:
      HttpConnectorConfiguration,
    requestHeaders:
      Record<string, string> |
      undefined,
  ): Record<string, string> {
    const headers:
      Record<string, string> = {
      ...configuration.headers,
      ...(requestHeaders ?? {}),
    };

    this.applyAuthentication(
      headers,
      configuration.authentication,
    );

    return headers;
  }

  private applyAuthentication(
    headers:
      Record<string, string>,
    authentication:
      HttpAuthentication,
  ): void {
    switch (
    authentication.type
    ) {
      case "NONE":
        return;

      case "BEARER":
        headers.Authorization =
          `Bearer ${authentication.token}`;

        return;

      case "API_KEY":
        headers[
          authentication.header
        ] =
          authentication.value;

        return;

      case "BASIC": {
        const credentials =
          Buffer.from(
            `${authentication.username}:${authentication.password}`,
          ).toString(
            "base64",
          );

        headers.Authorization =
          `Basic ${credentials}`;

        return;
      }

      case "CUSTOM":
        Object.assign(
          headers,
          authentication.headers,
        );

        return;
    }
  }

  // ===========================================================================
  // Body
  // ===========================================================================

  private serializeBody(
    body: HttpRequestBody,
    headers: Record<string, string>,
  ): string | undefined {
    if (
      body === undefined ||
      body === null
    ) {
      return undefined;
    }

    if (
      typeof body === "string"
    ) {
      return body;
    }

    if (
      !this.hasContentType(
        headers,
      )
    ) {
      headers["Content-Type"] =
        "application/json";
    }

    return JSON.stringify(
      body,
    );
  }

  private hasContentType(
    headers:
      Record<string, string>,
  ): boolean {
    return Object.keys(
      headers,
    ).some(
      (key) =>
        key.toLowerCase() ===
        "content-type",
    );
  }

  // ===========================================================================
  // Response
  // ===========================================================================

  private async readResponseBody(
    response: Response,
    headers:
      Record<string, string>,
  ): Promise<unknown> {
    const contentType =
      this.getHeader(
        headers,
        "content-type",
      );

    const text =
      await response.text();

    if (
      text.length === 0
    ) {
      return undefined;
    }

    if (
      contentType?.includes(
        "application/json",
      )
    ) {
      try {
        return JSON.parse(
          text,
        );
      } catch {
        return text;
      }
    }

    return text;
  }

  private extractHeaders(
    headers: Headers,
  ): Record<string, string> {
    const result:
      Record<string, string> = {};

    headers.forEach(
      (value, key) => {
        result[key] =
          value;
      },
    );

    return result;
  }

  private getHeader(
    headers:
      Record<string, string>,
    name: string,
  ): string | undefined {
    const key =
      Object.keys(
        headers,
      ).find(
        (candidate) =>
          candidate.toLowerCase() ===
          name.toLowerCase(),
      );

    return key
      ? headers[key]
      : undefined;
  }

  // ===========================================================================
  // Errors
  // ===========================================================================

  private getHttpErrorMessage(
    statusCode: number,
    body: unknown,
  ): string {
    if (
      typeof body === "string" &&
      body.length > 0
    ) {
      return body.slice(
        0,
        255,
      );
    }

    if (
      body &&
      typeof body === "object"
    ) {
      return JSON.stringify(
        body,
      ).slice(
        0,
        255,
      );
    }

    return `HTTP request failed with status code ${statusCode}.`;
  }

  private getErrorMessage(
    error: unknown,
  ): string {
    if (
      error instanceof Error
    ) {
      return error.message.slice(
        0,
        255,
      );
    }

    return String(error).slice(
      0,
      255,
    );
  }

  // ===========================================================================
  // URL Sanitization
  // ===========================================================================

  private sanitizeUrl(
    url: string,
  ): string {
    const sensitiveParameters = new Set([
      "password",
      "passwd",
      "pwd",
      "pass",

      "secret",

      "token",
      "apiToken",
      "api_token",

      "key",

      "apikey",
      "api_key",

      "accesskey",
      "access_key",
    ]);

    try {
      const parsedUrl =
        new URL(url);

      for (
        const key of
        parsedUrl.searchParams.keys()
      ) {
        const normalizedKey =
          key.toLowerCase();

        if (
          sensitiveParameters.has(
            normalizedKey,
          )
        ) {
          parsedUrl.searchParams.set(
            key,
            "[REDACTED]",
          );
        }
      }

      return parsedUrl.toString();
    } catch {
      return url.replace(
        /([?&](?:password|passwd|pwd|secret|token|key|apikey|api_key|accesskey|access_key)=)[^&]*/gi,
        "$1[REDACTED]",
      );
    }
  }
}