import {
  Module,
} from "@nestjs/common";

import {
  DiscoveryModule,
} from "@nestjs/core";

import {
  HttpClient,
} from "./http.client.js";

import {
  HTTP_SMS_PROVIDERS,
} from "./providers/core/http-sms-providers.list.js";

import { HttpDlrController } from "./dlr/dlr-controller.js";
import { DeliveryReceiptPublisher } from "./dlr/dlr-publisher.js";
import { HttpDlrService } from "./dlr/http-dlr.service.js";
import { HttpConsumer } from "./http-consumer/http.consumer.js";
import { HttpSubmissionService } from "./http-submission.service.js";
import {
  HttpSmsProviderRegistry,
} from "./providers/core/http-sms-provider-registry.js";
import { ConnectorResultPublisher } from "./publishers/connector-result.publisher.js";
import { HttpRepository } from "./repositories/http.repository.js";

@Module({
  controllers: [HttpDlrController],
  imports: [
    DiscoveryModule,
  ],

  providers: [
    HttpClient,
    HttpSubmissionService,
    HttpConsumer,
    ConnectorResultPublisher,
    HttpDlrService,
    DeliveryReceiptPublisher,
    HttpRepository,
    ...HTTP_SMS_PROVIDERS,

    HttpSmsProviderRegistry,
  ],

  exports: [
    HttpClient,

    HttpSmsProviderRegistry,
  ],
})
export class HttpModule { }