import {
  Injectable,
} from "@nestjs/common";

import {
  getComponentLogger,
  recordException,
  withSpan,
} from "@pague-co-uk/sms-gateway-telemetry";

import {
  HttpRepository,
} from "../repositories/http.repository.js";

import {
  parseHttpConnectorConfiguration,
} from "../http-connector-config.js";

import {
  HttpSmsProviderRegistry,
} from "../providers/core/http-sms-provider-registry.js";

import type {
  HttpSmsProvider,
} from "../providers/core/http-sms-provider.js";

import type {
  HttpDeliveryReceipt,
} from "../types/http-delivery-receipt.js";

import {
  DeliveryReceiptPublisher,
} from "./dlr-publisher.js";

@Injectable()
export class HttpDlrService {
  private readonly logger =
    getComponentLogger(
      HttpDlrService.name,
    );

  constructor(
    private readonly repository:
      HttpRepository,

    private readonly providerRegistry:
      HttpSmsProviderRegistry,

    private readonly deliveryReceiptPublisher:
      DeliveryReceiptPublisher,
  ) { }

  async process(
    payload: Record<string, unknown>,
  ): Promise<void> {
    await withSpan(
      "HttpDlrService.process",
      async (span) => {
        this.logger.info(
          {
            parameterCount:
              Object.keys(
                payload,
              ).length,

            payload,
          },
          "HTTP delivery receipt received.",
        );

        try {
          // ===================================================================
          // Identify provider and provider message ID
          // ===================================================================

          const matches =
            this.providerRegistry.identifyDlr(
              payload,
            );

          if (
            matches.length === 0
          ) {
            const error =
              new Error(
                "Unable to identify a provider message ID from the HTTP delivery receipt.",
              );

            recordException(error);

            this.logger.error(
              {
                parameterCount:
                  Object.keys(
                    payload,
                  ).length,

                payload,
              },
              "HTTP delivery receipt provider message ID could not be identified.",
            );

            throw error;
          }

          // ===================================================================
          // Find routing attempt
          // ===================================================================

          let matchedProvider:
            HttpSmsProvider | null =
            null;

          let providerMessageId:
            string | null =
            null;

          let attempt:
            Awaited<
              ReturnType<
                HttpRepository[
                  "findAttemptByProviderMessageId"
                ]
              >
            > | null =
            null;

          for (
            const match of matches
          ) {
            const candidateAttempt =
              await this.repository
                .findAttemptByProviderMessageId(
                  match.providerMessageId,
                );

            if (
              !candidateAttempt
            ) {
              continue;
            }

            matchedProvider =
              match.provider;

            providerMessageId =
              match.providerMessageId;

            attempt =
              candidateAttempt;

            break;
          }

          if (
            !attempt ||
            !matchedProvider ||
            !providerMessageId
          ) {
            const error =
              new Error(
                "No routing attempt was found for the provider message ID in the HTTP delivery receipt.",
              );

            recordException(error);

            this.logger.error(
              {
                candidateCount:
                  matches.length,

                payload,
              },
              "Routing attempt not found for HTTP delivery receipt.",
            );

            throw error;
          }

          // ===================================================================
          // Resolve connector
          // ===================================================================

          const connectorId =
            attempt.connectorId;

          span.setAttributes({
            "http.dlr.provider_message_id":
              providerMessageId,

            "http.dlr.connector_id":
              connectorId,
          });

          this.logger.info(
            {
              providerMessageId,
              connectorId,
              attemptId:
                attempt.id,
            },
            "Routing attempt found for HTTP delivery receipt.",
          );

          const connector =
            await this.repository.findConnector(
              connectorId,
            );

          if (!connector) {
            const error =
              new Error(
                `HTTP connector '${connectorId}' was not found.`,
              );

            recordException(error);

            this.logger.error(
              {
                connectorId,
                providerMessageId,
              },
              "HTTP connector not found for delivery receipt.",
            );

            throw error;
          }

          // ===================================================================
          // Validate connector configuration
          // ===================================================================

          if (
            !connector.configuration
          ) {
            const error =
              new Error(
                `HTTP connector '${connectorId}' has no configuration.`,
              );

            recordException(error);

            this.logger.error(
              {
                connectorId,
                providerMessageId,
              },
              "HTTP connector has no configuration.",
            );

            throw error;
          }

          // ===================================================================
          // Resolve provider
          // ===================================================================

          const providerCode =
            connector.provider;

          if (!providerCode) {
            const error =
              new Error(
                `HTTP connector '${connectorId}' has no provider code.`,
              );

            recordException(error);

            this.logger.error(
              {
                connectorId,
                providerMessageId,
              },
              "HTTP connector has no provider code.",
            );

            throw error;
          }

          const provider =
            this.providerRegistry.get(
              providerCode,
            );

          if (
            provider !==
            matchedProvider
          ) {
            const error =
              new Error(
                `HTTP delivery receipt provider does not match connector '${connectorId}'.`,
              );

            recordException(error);

            this.logger.error(
              {
                connectorId,
                providerCode,
                providerMessageId,
              },
              "HTTP delivery receipt provider mismatch.",
            );

            throw error;
          }

          span.setAttribute(
            "http.dlr.provider",
            providerCode,
          );

          this.logger.info(
            {
              connectorId,
              providerCode,
              providerMessageId,
            },
            "HTTP delivery receipt provider and connector resolved.",
          );

          // ===================================================================
          // Parse connector configuration
          // ===================================================================

          const configuration =
            parseHttpConnectorConfiguration(
              connector.configuration,
            );

          // ===================================================================
          // Process provider-specific DLR
          // ===================================================================

          const receipt:
            HttpDeliveryReceipt =
            await provider.processDlr(
              payload,
              configuration,
            );

          // ===================================================================
          // Validate normalized receipt
          // ===================================================================

          if (
            receipt.providerMessageId !==
            providerMessageId
          ) {
            const error =
              new Error(
                "Provider returned a different message ID from the one used to resolve the routing attempt.",
              );

            recordException(error);

            this.logger.error(
              {
                connectorId,
                providerCode,

                providerMessageId,

                normalizedProviderMessageId:
                  receipt.providerMessageId,

                payload,
              },
              "HTTP delivery receipt provider message ID mismatch.",
            );

            throw error;
          }

          // ===================================================================
          // Normalized receipt
          // ===================================================================

          span.setAttributes({
            "http.dlr.provider_message_id":
              receipt.providerMessageId,

            "http.dlr.status":
              receipt.status,
          });

          this.logger.info(
            {
              connectorId,
              providerCode,

              providerMessageId:
                receipt.providerMessageId,

              status:
                receipt.status,

              errorCode:
                receipt.errorCode,
            },
            "HTTP delivery receipt normalized.",
          );

          // ===================================================================
          // Publish normalized receipt
          // ===================================================================

          await this
            .deliveryReceiptPublisher
            .publish(
              receipt,
            );

          this.logger.info(
            {
              connectorId,

              providerMessageId:
                receipt.providerMessageId,

              status:
                receipt.status,
            },
            "HTTP delivery receipt published.",
          );
        } catch (error) {
          recordException(error);

          this.logger.error(
            {
              err:
                error,

              payload,
            },
            "HTTP delivery receipt processing failed.",
          );

          throw error;
        }
      },
    );
  }
}