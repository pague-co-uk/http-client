import {
  Inject,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

import type {
  QueueClient,
} from "@pague-co-uk/sms-gateway-queue-client";

import {
  getComponentLogger,
  recordException,
  withSpan,
} from "@pague-co-uk/sms-gateway-telemetry";

import {
  AppConfigService,
} from "../../config/config.service.js";

import {
  QUEUE_CLIENT,
} from "../../queue/constants/queue.constants.js";

import { ConnectorResultPublisher } from "../publishers/connector-result.publisher.js";

import {
  HttpRepository,
} from "../repositories/http.repository.js";

import { parseHttpConnectorConfiguration } from "../http-connector-config.js";
import { HttpSmsProviderRegistry } from "../providers/http-sms-provider-registry.js";
import { OutboundSms } from "../types/outbound-sms.js";
import { RoutingResult } from "../types/routing-result.js";

interface ConnectorMessage {
  messageId: string;
  attemptId: string;
  routeId: string;
  connectorId: string;
}

@Injectable()
export class HttpConsumer
  implements
  OnModuleInit,
  OnModuleDestroy {
  private readonly logger =
    getComponentLogger(
      HttpConsumer.name,
    );

  private running = false;

  constructor(
    @Inject(QUEUE_CLIENT)
    private readonly queue:
      QueueClient,

    private readonly config:
      AppConfigService,

    private readonly repository:
      HttpRepository,

    private readonly providerRegistry:
      HttpSmsProviderRegistry,

    private readonly resultPublisher:
      ConnectorResultPublisher,
  ) { }

  // ===========================================================================
  // Lifecycle
  // ===========================================================================

  async onModuleInit(): Promise<void> {
    this.running = true;

    this.logger.info(
      {
        queue:
          this.config.routing.consumerQueue,

        prefetch:
          this.config.rabbitmq.consumerPrefetch
      },
      "HTTP consumer starting.",
    );

    // =========================================================================
    // RabbitMQ
    // =========================================================================

    try {
      await this.queue.connect();

      this.logger.info(
        {
          queue:
            this.config.routing.consumerQueue,

          queueClientState:
            this.queue.currentState,
        },
        "HTTP consumer connected to RabbitMQ.",
      );
    } catch (error) {
      recordException(error);

      this.logger.error(
        {
          queue:
            this.config.routing.consumerQueue,

          err:
            error,
        },
        "HTTP consumer failed to connect to RabbitMQ.",
      );

      throw error;
    }

    // =========================================================================
    // Consumption
    // =========================================================================

    try {
      await this.startConsumption();
    } catch (error) {
      recordException(error);

      this.logger.error(
        {
          queue:
            this.config.routing.consumerQueue,

          err:
            error,
        },
        "HTTP consumer failed to bind to RabbitMQ queue.",
      );

      throw error;
    }

    this.logger.info(
      {
        queue:
          this.config.routing.consumerQueue,

        prefetch:
          this.config.rabbitmq.consumerPrefetch,
      },
      "HTTP consumer started successfully.",
    );
  }

  async onModuleDestroy(): Promise<void> {
    this.running = false;

    this.logger.info(
      {
        queue:
          this.config.routing.consumerQueue,
      },
      "HTTP consumer stopping.",
    );

    this.logger.info(
      "HTTP consumer stopped.",
    );
  }

  // ===========================================================================
  // RabbitMQ consumption
  // ===========================================================================

  private async startConsumption(): Promise<void> {
    this.logger.info(
      {
        queue:
          this.config.routing.consumerQueue,

        prefetch:
          this.config.rabbitmq.consumerPrefetch,
      },
      "Binding HTTP consumer to RabbitMQ queue.",
    );

    const consumer =
      await this.queue.subscribe<ConnectorMessage>(
        this.config.routing.consumerQueue,

        async (message) => {
          /*
           * The RabbitMQ message is acknowledged only after:
           *
           * 1. The HTTP provider has produced a submission outcome.
           * 2. That outcome has been successfully published to the
           *    routing result queue.
           */

          if (!this.running) {
            throw new Error(
              "HTTP consumer is shutting down.",
            );
          }

          await this.handleMessage(
            message,
          );
        },

        {
          noAck: false,

          prefetch:
            this.config.rabbitmq.consumerPrefetch,
        },
      );

    this.logger.info(
      {
        queue:
          this.config.routing.consumerQueue,

        consumerTag:
          consumer.consumerTag,
      },
      "Successfully bound HTTP consumer to RabbitMQ queue.",
    );
  }

  // ===========================================================================
  // Message handling
  // ===========================================================================
  private async handleMessage(
    message: ConnectorMessage,
  ): Promise<void> {
    await withSpan(
      "HttpConsumer.handleMessage",
      async (span) => {
        span.setAttributes({
          "message.id":
            message.messageId,

          "routing.attempt_id":
            message.attemptId,

          "routing.route_id":
            message.routeId,

          "routing.connector_id":
            message.connectorId,
        });

        this.logger.info(
          {
            messageId:
              message.messageId,

            attemptId:
              message.attemptId,

            routeId:
              message.routeId,

            connectorId:
              message.connectorId,
          },
          "HTTP connector message received.",
        );

        // =======================================================================
        // Validate routing attempt
        // =======================================================================

        const attempt =
          await this.repository.findAttempt(
            message.attemptId,
          );

        if (!attempt) {
          const error =
            new Error(
              `Routing attempt '${message.attemptId}' was not found.`,
            );

          recordException(error);

          this.logger.error(
            {
              messageId:
                message.messageId,

              attemptId:
                message.attemptId,

              connectorId:
                message.connectorId,
            },
            "Routing attempt not found.",
          );

          throw error;
        }

        // =======================================================================
        // Validate dispatch identity
        // =======================================================================

        if (
          attempt.messageId !==
          message.messageId
        ) {
          const error =
            new Error(
              "Routing attempt does not belong to the dispatched message.",
            );

          recordException(error);

          throw error;
        }

        if (
          attempt.routeId !==
          message.routeId
        ) {
          const error =
            new Error(
              "Routing attempt does not belong to the dispatched route.",
            );

          recordException(error);

          throw error;
        }

        if (
          attempt.connectorId !==
          message.connectorId
        ) {
          const error =
            new Error(
              "Routing attempt does not belong to the dispatched connector.",
            );

          recordException(error);

          throw error;
        }

        // =======================================================================
        // Load message
        // =======================================================================

        const sms =
          await this.repository.findMessageForSubmission(
            message.messageId,
          );

        if (!sms) {
          const error =
            new Error(
              `Message '${message.messageId}' was not found.`,
            );

          recordException(error);

          throw error;
        }

        // =======================================================================
        // Validate sender
        // =======================================================================

        if (!sms.senderId) {
          const error =
            new Error(
              `Message '${sms.id}' has no sender ID.`,
            );

          recordException(error);

          throw error;
        }

        if (!sms.senderId.sender) {
          const error =
            new Error(
              `Message '${sms.id}' has an empty sender address.`,
            );

          recordException(error);

          throw error;
        }

        // =======================================================================
        // Load connector
        // =======================================================================

        const connector =
          await this.repository.findConnector(
            message.connectorId,
          );

        if (!connector) {
          const error =
            new Error(
              `HTTP connector '${message.connectorId}' was not found.`,
            );

          recordException(error);

          throw error;
        }

        // =======================================================================
        // Validate connector configuration
        // =======================================================================

        if (!connector.configuration) {
          const error =
            new Error(
              `HTTP connector '${message.connectorId}' has no configuration.`,
            );

          recordException(error);

          throw error;
        }

        // =======================================================================
        // Resolve provider
        // =======================================================================

        const providerCode =
          connector.provider;

        if (!providerCode) {
          const error =
            new Error(
              `HTTP connector '${message.connectorId}' has no provider code.`,
            );

          recordException(error);

          throw error;
        }

        const provider =
          this.providerRegistry.get(
            providerCode,
          );

        if (!provider) {
          const error =
            new Error(
              `No HTTP provider is registered for provider code '${providerCode}'.`,
            );

          recordException(error);

          this.logger.error(
            {
              messageId:
                sms.id,

              attemptId:
                attempt.id,

              connectorId:
                message.connectorId,

              providerCode,
            },
            "HTTP provider could not be resolved.",
          );

          throw error;
        }

        // =======================================================================
        // Build normalized outbound SMS
        // =======================================================================

        const outboundSms: OutboundSms = {
          messageId:
            sms.id,

          publicId:
            sms.publicId,

          clientId:
            sms.clientId,

          destination:
            sms.destination,

          sender:
            sms.senderId.sender,

          body:
            sms.body,

          encoding:
            sms.encoding,

          segmentCount:
            sms.segmentCount,
        };

        // =======================================================================
        // Parse connector configuration
        // =======================================================================

        const configuration =
          parseHttpConnectorConfiguration(
            connector.configuration,
          );

        // =======================================================================
        // Submit SMS through provider
        // =======================================================================

        this.logger.info(
          {
            messageId:
              sms.id,

            attemptId:
              attempt.id,

            connectorId:
              message.connectorId,

            providerCode,

            destination:
              sms.destination,

            sender:
              sms.senderId.sender,

            encoding:
              sms.encoding,

            segmentCount:
              sms.segmentCount,
          },
          "Submitting SMS through HTTP provider.",
        );

        const submission =
          await provider.send(
            message.connectorId,
            outboundSms,
            configuration,
          );

        // =======================================================================
        // Record provider result
        // =======================================================================

        span.setAttributes({
          "http.submission.status":
            submission.status,

          "http.provider_code":
            providerCode,
        });

        // =======================================================================
        // Build routing result
        // =======================================================================

        const base = {
          messageId: message.messageId,
          attemptId: message.attemptId,
          routeId: message.routeId,
          connectorId: message.connectorId,
        };

        const routingResult: RoutingResult =
          submission.status === "SUBMITTED"
            ? {
              ...base,
              status: submission.status,
              providerMessageId: submission.providerMessageId,
            }
            : {
              ...base,
              status: submission.status,
              errorCode: submission.errorCode,
              errorMessage: submission.errorMessage,
            };

        // =======================================================================
        // Publish routing result
        // =======================================================================

        await this.resultPublisher.publish(
          routingResult,
        );

        // =======================================================================
        // Result published
        // =======================================================================

        this.logger.info(
          {
            messageId:
              message.messageId,

            attemptId:
              message.attemptId,

            routeId:
              message.routeId,

            connectorId:
              message.connectorId,

            providerCode,

            status:
              submission.status,

            providerMessageId: submission.status == "SUBMITTED" ?
              submission.providerMessageId : null,
          },
          "HTTP submission result published.",
        );
      },
    );
  }

}