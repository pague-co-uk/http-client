import {
  Injectable,
} from "@nestjs/common";

import {
  getComponentLogger,
  recordException,
  withSpan,
} from "@pague-co-uk/sms-gateway-telemetry";

import {
  ConnectorTransport,
} from "@prisma/client";
import { parseHttpConnectorConfiguration } from "./http-connector-config.js";

import {
  HttpRepository,
} from "./repositories/http.repository.js";

import {
  HttpSmsProviderRegistry,
} from "./providers/http-sms-provider-registry.js";

import type {
  HttpSubmissionResult,
} from "./types/http-submission-result.js";

import type {
  OutboundSms,
} from "./types/outbound-sms.js";

@Injectable()
export class HttpSubmissionService {
  private readonly logger =
    getComponentLogger(
      HttpSubmissionService.name,
    );

  constructor(
    private readonly repository:
      HttpRepository,

    private readonly providers:
      HttpSmsProviderRegistry,
  ) { }

  // ===========================================================================
  // Submit
  // ===========================================================================

  async submit(
    connectorId: string,
    sms: OutboundSms,
  ): Promise<HttpSubmissionResult> {
    return withSpan(
      "HttpSubmissionService.submit",
      async (span) => {
        span.setAttributes({
          "http.connector_id":
            connectorId,

          "message.id":
            sms.messageId,
        });

        // =====================================================================
        // Load connector
        // =====================================================================

        const connector =
          await this.repository.findConnector(
            connectorId,
          );

        if (!connector) {
          const error =
            new Error(
              `Connector '${connectorId}' was not found.`,
            );

          recordException(error);

          throw error;
        }

        span.setAttributes({
          "http.connector_code":
            connector.code,

          "http.connector_provider":
            connector.provider,
        });

        // =====================================================================
        // Validate connector
        // =====================================================================

        if (
          connector.transport !==
          ConnectorTransport.HTTP
        ) {
          throw new Error(
            `Connector '${connector.code}' is not an HTTP connector.`,
          );
        }

        // =====================================================================
        // Validate connector status
        // =====================================================================

        /*
         * The routing layer normally selects ACTIVE connectors.
         *
         * We still validate here because this is a safety boundary between
         * routing data and an actual provider request.
         */
        if (
          connector.status !==
          "ACTIVE"
        ) {
          throw new Error(
            `Connector '${connector.code}' is not active.`,
          );
        }

        // =====================================================================
        // Validate provider
        // =====================================================================

        if (
          !connector.provider ||
          connector.provider.length === 0
        ) {
          throw new Error(
            `HTTP connector '${connector.code}' has no provider configured.`,
          );
        }

        // =====================================================================
        // Parse configuration
        // =====================================================================

        const configuration =
          parseHttpConnectorConfiguration(
            connector.configuration,
          );

        // =====================================================================
        // Resolve provider
        // =====================================================================

        const provider =
          this.providers.get(
            connector.provider,
          );

        this.logger.info(
          {
            connectorId:
              connector.id,

            connectorCode:
              connector.code,

            provider:
              connector.provider,

            messageId:
              sms.messageId,

            destination:
              sms.destination,
          },
          "Submitting SMS through HTTP provider.",
        );

        // =====================================================================
        // Provider submission
        // =====================================================================

        const result =
          await provider.send(
            connector.id,

            sms,

            configuration,
          );

        span.setAttributes({
          "http.submission.status":
            result.status,

          "http.response.status_code":
            result.statusCode ??
            0,
        });

        this.logger.info( 
          {
            connectorId:
              connector.id,

            connectorCode:
              connector.code,

            provider:
              connector.provider,

            messageId:
              sms.messageId,

            status:
              result.status,

            statusCode:
              result.statusCode,
          },
          "HTTP SMS provider submission completed.",
        );

        return result;
      },
    );
  }
}