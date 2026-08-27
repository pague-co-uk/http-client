# How to Add an HTTP SMS Provider

This guide explains how to add a new HTTP SMS provider to Pague 2.0.

The HTTP architecture deliberately separates HTTP transport from provider-specific behaviour:

- `HttpClient` handles HTTP transport.
- Provider implementations construct provider-specific requests and interpret provider responses.
- `HttpSmsProviderRegistry` resolves providers by provider code.
- The HTTP consumer orchestrates message processing and publishes routing results.

## 1. Complete Application Architecture

![Pague 2.0 Application Architecture](pague architecture-architecture.png)

The supplied architecture diagram above is the authoritative application architecture diagram.

At the outbound delivery level:

```text
                         Control Plane API
                                |
                                v
                         Routing Engine
                                |
                                v
                             RabbitMQ
                         /              \
                        /                \
                       v                  v
                 SMPP Client          HTTP Client
                      |                    |
                      v                    v
                  SmppClient        Provider Registry
                      |                    |
                      v             +------+------+
                     SMPP            |      |      |
                      |              v      v      v
                      |          Provider Provider Provider
                      |              |      |      |
                      |              +------+------+
                      |                     |
                      |                     v
                      |                HttpClient
                      |                     |
                      v                     v
                 SMSC / Network       Provider HTTP API
                                            |
                                            v
                                         Handset
```

## 2. HTTP Architecture

The HTTP side uses one shared HTTP client and provider-specific adapters:

```text
RabbitMQ
   |
   v
HttpConsumer
   |
   v
HTTP submission/service layer
   |
   | connector.provider
   v
HttpSmsProviderRegistry
   |
   +--> airtel-malawi --> AirtelMalawiHttpSmsProvider
   |
   +--> tnm-malawi    --> TnmMalawiHttpSmsProvider
   |
   +--> example       --> ExampleHttpSmsProvider
                              |
                              v
                          HttpClient
                              |
                              v
                         Provider API
```

The key rule is:

> `HttpClient` knows HTTP. The provider implementation knows the provider.

Do not put provider-specific payload construction or response interpretation into `HttpClient`.

## 3. Provider Convention

Providers live under:

```text
src/http/providers/
```

Provider implementation filenames should use:

```text
<provider-code>.http-sms-provider.ts
```

Examples:

```text
airtel-malawi.http-sms-provider.ts
tnm-malawi.http-sms-provider.ts
```

Runtime discovery does **not** scan the filesystem. The filename is a naming convention for maintainability.

The provider code is declared explicitly with the decorator:

```ts
@HttpSmsProvider("airtel-malawi")
@Injectable()
export class AirtelMalawiHttpSmsProvider
  implements HttpSmsProvider {
  // ...
}
```

The value passed to `@HttpSmsProvider()` must match the connector's database `provider` value.

## 4. Provider Interface

Every provider implements:

```ts
import type {
  HttpConnectorConfiguration,
} from "../types/http-connector-configuration.js";

import type {
  HttpSubmissionResult,
} from "../types/http-submission-result.js";

import type {
  OutboundSms,
} from "../types/outbound-sms.js";

export interface HttpSmsProvider {
  send(
    connectorId: string,
    sms: OutboundSms,
    configuration: HttpConnectorConfiguration,
  ): Promise<HttpSubmissionResult>;
}
```

The provider receives:

1. `connectorId`
2. `OutboundSms`
3. Parsed `HttpConnectorConfiguration`

The provider constructs the actual provider-specific HTTP request.

## 5. OutboundSms

`OutboundSms` represents the normalized message being delivered.

It should contain the message information required by providers, such as:

```text
message ID
public ID
sender
destination
body
encoding
segment count
```

Do not add provider-specific fields to `OutboundSms`.

Provider-specific information belongs in the provider implementation and connector configuration.

The intended flow is:

```text
Database Message
       |
       v
OutboundSms
       |
       v
Provider
       |
       +--> provider-specific request body
       +--> provider-specific response interpretation
```

## 6. Connector Configuration

The provider receives parsed:

```ts
HttpConnectorConfiguration
```

which contains the common HTTP configuration:

```ts
export interface HttpConnectorConfiguration {
  baseUrl: string;

  sendPath: string;

  method: HttpMethod;

  authentication: HttpAuthentication;

  connectTimeout: number;

  requestTimeout: number;

  reconnectDelay: number;

  maxReconnectDelay: number;

  headers: Record<string, string>;
}
```

The raw connector configuration from the database is parsed by:

```text
parseHttpConnectorConfiguration()
```

The provider should not parse the raw database JSON itself.

## 7. Authentication

`HttpClient` handles the standard HTTP authentication mechanisms:

```text
NONE
BEARER
API_KEY
BASIC
CUSTOM
```

Providers should normally not manually construct standard authentication headers.

For example, do not duplicate bearer authentication inside a provider when it is already represented by:

```ts
configuration.authentication
```

The provider passes the configuration to `HttpClient`, which applies authentication.

## 8. Implementing a Provider

Create:

```text
src/http/providers/airtel-malawi.http-sms-provider.ts
```

Example:

```ts
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

@HttpSmsProvider("airtel-malawi")
@Injectable()
export class AirtelMalawiHttpSmsProvider
  implements HttpSmsProviderContract {

  constructor(
    private readonly http: HttpClient,
  ) {}

  async send(
    connectorId: string,
    sms: OutboundSms,
    configuration: HttpConnectorConfiguration,
  ): Promise<HttpSubmissionResult> {
    const body = {
      from: sms.sender,
      to: sms.destination,
      message: sms.body,
    };

    const response =
      await this.http.request({
        connectorId,
        configuration,
        body,
      });

    return this.translateResponse(response);
  }

  private translateResponse(
    response: HttpRequestResult,
  ): HttpSubmissionResult {
    switch (response.status) {
      case "SUCCESS":
        return {
          status: "SUBMITTED",
          statusCode: response.statusCode,
          providerResponse: response.body,
        };

      case "FAILED":
        return {
          status: "FAILED",
          statusCode: response.statusCode,
          errorCode: response.errorCode,
          errorMessage: response.errorMessage,
        };

      case "UNKNOWN":
        return {
          status: "UNKNOWN",
          errorCode: response.errorCode,
          errorMessage: response.errorMessage,
        };

      case "DISCONNECTED":
        return {
          status: "DISCONNECTED",
          errorCode: "HTTP_DISCONNECTED",
          errorMessage: response.errorMessage,
        };
    }
  }
}
```

Replace the example payload and response interpretation with the provider's actual API contract.

## 9. HTTP Result vs SMS Submission Result

`HttpClient` returns a transport-level:

```text
HttpRequestResult
```

with outcomes such as:

```text
SUCCESS
FAILED
UNKNOWN
DISCONNECTED
```

The provider translates that into the SMS-level:

```text
HttpSubmissionResult
```

with outcomes:

```text
SUBMITTED
FAILED
UNKNOWN
DISCONNECTED
```

For example:

```text
HTTP 200
   |
   v
HttpRequestResult.SUCCESS
   |
   v
Provider examines response body
   |
   +--> provider accepted SMS --> SUBMITTED
   |
   +--> provider rejected SMS --> FAILED
```

Do not assume every HTTP 2xx response means that an SMS was submitted. A provider may return HTTP 200 while reporting an application-level failure in its response body.

That interpretation belongs to the provider implementation.

## 10. Registering the Provider

Providers are registered through:

```text
src/http/providers/http-sms-providers.ts
```

Example:

```ts
import {
  AirtelMalawiHttpSmsProvider,
} from "./airtel-malawi.http-sms-provider.js";

import {
  ExampleHttpSmsProvider,
} from "./example-http-sms-provider.js";

export const HTTP_SMS_PROVIDERS = [
  ExampleHttpSmsProvider,
  AirtelMalawiHttpSmsProvider,
];
```

The provider class is then available to Nest and `HttpSmsProviderRegistry` discovers it through `DiscoveryService` and the `@HttpSmsProvider()` metadata.

Do not add provider-specific logic to the registry.

Do not add provider-specific logic to `HttpClient`.

## 11. Provider Registry

Conceptually, the registry builds:

```text
Map<string, HttpSmsProvider>
```

such as:

```text
"example"       -> ExampleHttpSmsProvider
"airtel-malawi" -> AirtelMalawiHttpSmsProvider
"tnm-malawi"    -> TnmMalawiHttpSmsProvider
```

The runtime lookup is:

```ts
const provider =
  this.registry.get(
    connector.provider,
  );
```

This means the database determines which implementation handles a connector.

## 12. Multiple Connectors Can Share a Provider

A provider implementation is not the same thing as a connector.

For example:

```text
Connector A
    provider = airtel-malawi
    configuration = Airtel account A

Connector B
    provider = airtel-malawi
    configuration = Airtel account B

Connector C
    provider = airtel-malawi
    configuration = Airtel account C
```

All three use:

```text
AirtelMalawiHttpSmsProvider
```

while receiving their own `HttpConnectorConfiguration`.

This is why provider implementation and connector configuration must remain separate.

## 13. Adding a Provider Checklist

1. Create the provider class:

```text
src/http/providers/<provider-code>.http-sms-provider.ts
```

2. Add:

```ts
@HttpSmsProvider("<provider-code>")
```

3. Add:

```ts
@Injectable()
```

4. Implement:

```ts
HttpSmsProvider
```

5. Inject `HttpClient`.

6. Construct the provider-specific request body.

7. Call `HttpClient`.

8. Interpret the provider response.

9. Return `HttpSubmissionResult`.

10. Add the provider class to:

```text
HTTP_SMS_PROVIDERS
```

11. Configure the corresponding database connector with:

```text
provider = <provider-code>
```

12. Build and test:

```bash
npm run build
```

## 14. Responsibilities

| Responsibility | HttpClient | Provider |
|---|---:|---:|
| HTTP transport | Yes | No |
| HTTP timeout | Yes | No |
| HTTP headers | Yes | No |
| Standard authentication | Yes | No |
| HTTP body serialization | Yes | No |
| HTTP response parsing | Yes | No |
| Network error handling | Yes | No |
| Provider payload construction | No | Yes |
| Provider-specific response interpretation | No | Yes |
| Provider message ID extraction | No | Yes |
| Provider-specific error interpretation | No | Yes |
| SMS submission result | No | Yes |

## 15. What Not to Do

Do not put this into `HttpClient`:

```ts
if (provider === "airtel-malawi") {
  // Airtel payload
}

if (provider === "tnm-malawi") {
  // TNM payload
}
```

Do not put provider-specific behaviour into `HttpConsumer`.

Do not create a separate HTTP transport client for every provider.

The intended architecture is:

```text
One HttpClient
        |
        +--> Provider A
        +--> Provider B
        +--> Provider C
        +--> Provider D
```

Each provider receives the connector configuration and the normalized SMS and is responsible for translating those into the provider's API contract.

## 16. Final HTTP Delivery Path

```text
Message
   |
   v
Routing
   |
   v
RabbitMQ
   |
   v
HttpConsumer
   |
   v
Connector
   |
   v
Provider Registry
   |
   v
Provider Implementation
   |
   v
HttpClient
   |
   v
Provider HTTP API
   |
   v
Handset
```

The provider abstraction allows new HTTP providers to be added without changing the shared HTTP transport, queue handling, or routing architecture.
