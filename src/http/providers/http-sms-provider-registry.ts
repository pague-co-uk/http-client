import {
  Injectable,
  OnModuleInit,
} from "@nestjs/common";

import {
  DiscoveryService,
} from "@nestjs/core";

import {
  HTTP_SMS_PROVIDER,
} from "./http-sms-provider.decorator.js";

import type {
  HttpSmsProvider,
} from "./http-sms-provider.js";

export interface HttpDlrProviderMatch {
  provider: HttpSmsProvider;
  providerMessageId: string;
}

@Injectable()
export class HttpSmsProviderRegistry
  implements OnModuleInit {
  private readonly providers =
    new Map<
      string,
      HttpSmsProvider
    >();

  constructor(
    private readonly discovery:
      DiscoveryService,
  ) { }

  // ===========================================================================
  // Provider discovery
  // ===========================================================================

  onModuleInit(): void {
    const wrappers =
      this.discovery.getProviders();

    for (
      const wrapper of wrappers
    ) {
      const instance =
        wrapper.instance;

      if (!instance) {
        continue;
      }

      const constructor =
        instance.constructor;

      const codes =
        Reflect.getMetadata(
          HTTP_SMS_PROVIDER,
          constructor,
        );

      if (
        !Array.isArray(codes) ||
        codes.some(
          (code) =>
            typeof code !==
            "string",
        )
      ) {
        continue;
      }

      if (
        typeof instance.send !==
        "function"
      ) {
        throw new Error(
          `HTTP SMS provider '${codes.join(", ")}' does not implement send().`,
        );
      }

      if (
        typeof instance.identifyDlr !==
        "function"
      ) {
        throw new Error(
          `HTTP SMS provider '${codes.join(", ")}' does not implement identifyDlr().`,
        );
      }

      if (
        typeof instance.processDlr !==
        "function"
      ) {
        throw new Error(
          `HTTP SMS provider '${codes.join(", ")}' does not implement processDlr().`,
        );
      }

      for (
        const code of codes
      ) {
        if (
          this.providers.has(
            code,
          )
        ) {
          throw new Error(
            `HTTP SMS provider '${code}' is registered more than once.`,
          );
        }

        this.providers.set(
          code,
          instance as HttpSmsProvider,
        );
      }
    }
  }

  // ===========================================================================
  // Resolve provider by code
  // ===========================================================================

  get(
    code: string,
  ): HttpSmsProvider {
    const provider =
      this.providers.get(
        code,
      );

    if (!provider) {
      throw new Error(
        `HTTP SMS provider '${code}' is not registered.`,
      );
    }

    return provider;
  }

  // ===========================================================================
  // Identify DLR provider candidates
  // ===========================================================================

  identifyDlr(
    payload: Record<string, unknown>,
  ): HttpDlrProviderMatch[] {
    const matches:
      HttpDlrProviderMatch[] = [];

    for (
      const provider of
      new Set(
        this.providers.values(),
      )
    ) {
      const providerMessageId =
        provider.identifyDlr(
          payload,
        );

      if (
        !providerMessageId
      ) {
        continue;
      }

      matches.push({
        provider,
        providerMessageId,
      });
    }

    return matches;
  }

  // ===========================================================================
  // Provider existence
  // ===========================================================================

  has(
    code: string,
  ): boolean {
    return this.providers.has(
      code,
    );
  }

  // ===========================================================================
  // Registered provider names
  // ===========================================================================

  getNames(): string[] {
    return [
      ...this.providers.keys(),
    ];
  }
}