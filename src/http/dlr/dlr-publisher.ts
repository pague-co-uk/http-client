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

import {
  AppConfigService,
} from "../../config/config.service.js";

import {
  QUEUE_CLIENT,
} from "../../queue/constants/queue.constants.js";
import { HttpDeliveryReceipt } from "../types/http-delivery-receipt.js";


@Injectable()
export class DeliveryReceiptPublisher {
  private readonly logger =
    getComponentLogger(
      DeliveryReceiptPublisher.name,
    );

  constructor(
    @Inject(QUEUE_CLIENT)
    private readonly queue:
      QueueClient,

    private readonly config:
      AppConfigService,
  ) { }

  async publish(
    receipt: HttpDeliveryReceipt,
  ): Promise<void> {
    await withSpan(
      "DeliveryReceiptPublisher.publish",
      async (span) => {
        span.setAttributes({
          "delivery_receipt.connector_id":
            receipt.connectorId,

          "delivery_receipt.provider_message_id":
            receipt.providerMessageId,

          "delivery_receipt.status":
            receipt.status,

          "messaging.destination":
            this.config.routing
              .deliveryReceiptQueue,
        });

        this.logger.info(
          {
            connectorId:
              receipt.connectorId,

            providerMessageId:
              receipt.providerMessageId,

            status:
              receipt.status,
          },
          "Publishing delivery receipt.",
        );

        try {
          await this.queue.publish(
            this.config.routing
              .deliveryReceiptQueue,
            receipt,
          );

          this.logger.info(
            {
              connectorId:
                receipt.connectorId,

              providerMessageId:
                receipt.providerMessageId,

              status:
                receipt.status,
            },
            "Delivery receipt published.",
          );
        } catch (error) {
          recordException(error);

          this.logger.error(
            {
              connectorId:
                receipt.connectorId,

              providerMessageId:
                receipt.providerMessageId,

              status:
                receipt.status,

              err:
                error,
            },
            "Failed to publish delivery receipt.",
          );

          throw error;
        }
      },
    );
  }
}