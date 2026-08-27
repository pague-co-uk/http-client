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
} from "./providers/http-sms-providers.list.js";

import { HttpConsumer } from "./http-consumer/http.consumer.js";
import { HttpSubmissionService } from "./http-submission.service.js";
import {
  HttpSmsProviderRegistry,
} from "./providers/http-sms-provider-registry.js";
import { ConnectorResultPublisher } from "./publishers/connector-result.publisher.js";
import { HttpRepository } from "./repositories/http.repository.js";

@Module({
  imports: [
    DiscoveryModule,
  ],

  providers: [
    HttpClient,
    HttpSubmissionService,
    HttpConsumer,
    ConnectorResultPublisher,
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