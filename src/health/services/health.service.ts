import {
  Injectable,
} from "@nestjs/common";

import {
  Loggers,
} from "@pague-co-uk/sms-gateway-telemetry";

// ============================================================================
// Health Service
// ============================================================================

@Injectable()
export class HealthService {
  private readonly logger =
    Loggers.app;

  // ==========================================================================
  // Health check
  // ==========================================================================

  public check() {
    const start =
      performance.now();

    const response = {
      status: "healthy" as const,

      service:
        process.env.APP_NAME ??
        "http-client",

      version:
        process.env.APP_VERSION ??
        "unknown",

      environment:
        process.env.NODE_ENV ??
        "development",

      uptime:
        Math.round(
          process.uptime(),
        ),

      timestamp:
        new Date().toISOString(),
    };

    const latency =
      Math.round(
        performance.now() -
        start,
      );

    this.logger.debug(
      {
        status:
          response.status,

        latency,
      },
      "Http client health check completed.",
    );

    return {
      ...response,
      latency,
    };
  }
}