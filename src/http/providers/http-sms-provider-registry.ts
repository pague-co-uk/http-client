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

      const code =
        Reflect.getMetadata(
          HTTP_SMS_PROVIDER,
          constructor,
        );

      if (
        typeof code !==
        "string"
      ) {
        continue;
      }

      if (
        typeof instance.send !==
        "function"
      ) {
        throw new Error(
          `HTTP SMS provider '${code}' does not implement send().`,
        );
      }

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

  has(
    code: string,
  ): boolean {
    return this.providers.has(
      code,
    );
  }

  getNames(): string[] {
    return [
      ...this.providers.keys(),
    ];
  }
}