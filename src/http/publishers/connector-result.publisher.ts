import {
  Inject,
  Injectable,
} from "@nestjs/common";

import type {
  QueueClient,
} from "@pague-co-uk/sms-gateway-queue-client";

import {
  getComponentLogger,
  recordException,
  withSpan,
} from "@pague-co-uk/sms-gateway-telemetry";

import { QUEUE_CLIENT } from "../../queue/constants/queue.constants.js";

import { AppConfigService } from "../../config/config.service.js";

import { RoutingResult } from "../../http/types/routing-result.js";


@Injectable()
export class ConnectorResultPublisher {
  private readonly logger =
    getComponentLogger(
      ConnectorResultPublisher.name,
    );

  constructor(
    @Inject(QUEUE_CLIENT)
    private readonly queue:
      QueueClient,
    private readonly config: AppConfigService
  ) { }

  async publish(
    result: RoutingResult,
  ): Promise<void> {
    await withSpan(
      "ConnectorResultPublisher.publish",
      async (span) => {
        span.setAttributes({
          "message.id":
            result.messageId,

          "routing.attempt_id":
            result.attemptId,

          "routing.route_id":
            result.routeId,

          "routing.connector_id":
            result.connectorId,

          "routing.result_status":
            result.status,

          "messaging.destination":
            this.config.routing.resultQueue,
        });

        this.logger.info(
          {
            queue:
              this.config.routing.resultQueue,

            messageId:
              result.messageId,

            attemptId:
              result.attemptId,

            routeId:
              result.routeId,

            connectorId:
              result.connectorId,

            status:
              result.status,

            providerMessageId:
              result.providerMessageId,
          },
          "Publishing connector result.",
        );

        try {
          await this.queue.publish(
            this.config.routing.resultQueue,
            result,
          );

          this.logger.info(
            {
              queue:
                this.config.routing.resultQueue,

              messageId:
                result.messageId,

              attemptId:
                result.attemptId,

              status:
                result.status,
            },
            "Connector result published.",
          );
        } catch (error) {
          recordException(error);

          this.logger.error(
            {
              queue:
                this.config.routing.resultQueue,

              messageId:
                result.messageId,

              attemptId:
                result.attemptId,

              status:
                result.status,

              err:
                error,
            },
            "Failed to publish connector result.",
          );

          throw error;
        }
      },
    );
  }
}