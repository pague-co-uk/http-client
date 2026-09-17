import type {
  HttpAuthentication,
  HttpConnectorConfiguration,
  HttpMethod,
} from "./types/http-connector-configuration.js";

export function parseHttpConnectorConfiguration(
  configuration: unknown,
): HttpConnectorConfiguration {
  if (
    !configuration ||
    typeof configuration !== "object" ||
    Array.isArray(configuration)
  ) {
    throw new Error(
      "HTTP connector configuration is missing or invalid.",
    );
  }

  const value =
    configuration as Record<
      string,
      unknown
    >;

  // ===========================================================================
  // Base URL
  // ===========================================================================

  if (
    typeof value.baseUrl !== "string" ||
    value.baseUrl.length === 0
  ) {
    throw new Error(
      "HTTP connector configuration requires 'baseUrl'.",
    );
  }

  let baseUrl: string;

  try {
    baseUrl =
      new URL(
        value.baseUrl,
      ).toString();
  } catch {
    throw new Error(
      "HTTP connector configuration requires a valid 'baseUrl'.",
    );
  }

  // ===========================================================================
  // Send path
  // ===========================================================================

  if (
    typeof value.sendPath !== "string" ||
    value.sendPath.length === 0
  ) {
    throw new Error(
      "HTTP connector configuration requires 'sendPath'.",
    );
  }

  // ===========================================================================
  // HTTP method
  // ===========================================================================

  const method =
    value.method === undefined
      ? "POST"
      : parseHttpMethod(
        value.method,
      );

  // ===========================================================================
  // Authentication
  // ===========================================================================

  const authentication =
    parseAuthentication(
      value.authentication,
    );

  // ===========================================================================
  // Headers
  // ===========================================================================

  const headers =
    parseHeaders(
      value.headers,
    );

  // ===========================================================================
  // Timeouts
  // ===========================================================================

  const connectTimeout =
    parsePositiveNumber(
      value.connectTimeout,
      5000,
      "connectTimeout",
    );

  const requestTimeout =
    parsePositiveNumber(
      value.requestTimeout,
      30000,
      "requestTimeout",
    );

  // ===========================================================================
  // Reconnection
  // ===========================================================================

  const reconnectDelay =
    parsePositiveNumber(
      value.reconnectDelay,
      5000,
      "reconnectDelay",
    );

  const maxReconnectDelay =
    parsePositiveNumber(
      value.maxReconnectDelay,
      30000,
      "maxReconnectDelay",
    );

  if (
    maxReconnectDelay <
    reconnectDelay
  ) {
    throw new Error(
      "HTTP connector configuration 'maxReconnectDelay' must be greater than or equal to 'reconnectDelay'.",
    );
  }

  // ===========================================================================
  // Provider-specific configuration
  //
  // The canonical format is:
  //
  // {
  //   providerConfiguration: {
  //     username: "...",
  //     password: "...",
  //     type: "0",
  //     dlr: "1"
  //   }
  // }
  //
  // The returned configuration exposes the contents directly:
  //
  // {
  //   providerConfiguration: {
  //     username: "...",
  //     password: "...",
  //     type: "0",
  //     dlr: "1"
  //   }
  // }
  //
  // Legacy top-level provider-specific fields are also preserved.
  // ===========================================================================

  const providerConfiguration:
    Record<string, unknown> = {};

  if (
    value.providerConfiguration !==
    undefined
  ) {
    if (
      !value.providerConfiguration ||
      typeof value.providerConfiguration !==
      "object" ||
      Array.isArray(
        value.providerConfiguration,
      )
    ) {
      throw new Error(
        "HTTP connector 'providerConfiguration' must be an object.",
      );
    }

    Object.assign(
      providerConfiguration,
      value.providerConfiguration as Record<
        string,
        unknown
      >,
    );
  }

  const genericConfigurationKeys =
    new Set([
      "baseUrl",
      "sendPath",
      "method",
      "authentication",
      "connectTimeout",
      "requestTimeout",
      "reconnectDelay",
      "maxReconnectDelay",
      "headers",
      "providerConfiguration",
    ]);

  for (
    const [
      key,
      providerValue,
    ] of Object.entries(
      value,
    )
  ) {
    if (
      genericConfigurationKeys.has(
        key,
      )
    ) {
      continue;
    }

    providerConfiguration[key] =
      providerValue;
  }

  // ===========================================================================
  // Return normalized configuration
  // ===========================================================================

  return {
    baseUrl,

    sendPath:
      value.sendPath,

    method,

    authentication,

    connectTimeout,

    requestTimeout,

    reconnectDelay,

    maxReconnectDelay,

    headers,

    providerConfiguration,
  };
}

// =============================================================================
// HTTP Method
// =============================================================================

function parseHttpMethod(
  value: unknown,
): HttpMethod {
  if (
    typeof value !== "string"
  ) {
    throw new Error(
      "HTTP connector configuration 'method' must be a valid HTTP method.",
    );
  }

  switch (
  value.toUpperCase()
  ) {
    case "GET":
      return "GET";

    case "HEAD":
      return "HEAD";

    case "POST":
      return "POST";

    case "PUT":
      return "PUT";

    case "PATCH":
      return "PATCH";

    case "DELETE":
      return "DELETE";

    case "OPTIONS":
      return "OPTIONS";

    case "TRACE":
      return "TRACE";

    case "CONNECT":
      return "CONNECT";

    default:
      throw new Error(
        `Unsupported HTTP method '${value}'. Supported methods are GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS, TRACE, and CONNECT.`,
      );
  }
}

// =============================================================================
// Authentication
// =============================================================================

function parseAuthentication(
  value: unknown,
): HttpAuthentication {
  if (
    value === undefined ||
    value === null
  ) {
    return {
      type: "NONE",
    };
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "HTTP connector authentication must be an object.",
    );
  }

  const authentication =
    value as Record<
      string,
      unknown
    >;

  if (
    typeof authentication.type !==
    "string"
  ) {
    throw new Error(
      "HTTP connector authentication requires 'type'.",
    );
  }

  switch (
  authentication.type
  ) {
    case "NONE":
      return {
        type: "NONE",
      };

    case "BEARER": {
      if (
        typeof authentication.token !==
        "string" ||
        authentication.token.length ===
        0
      ) {
        throw new Error(
          "Bearer authentication requires 'token'.",
        );
      }

      return {
        type: "BEARER",

        token:
          authentication.token,
      };
    }

    case "API_KEY": {
      if (
        typeof authentication.header !==
        "string" ||
        authentication.header.length ===
        0
      ) {
        throw new Error(
          "API key authentication requires 'header'.",
        );
      }

      if (
        typeof authentication.value !==
        "string" ||
        authentication.value.length ===
        0
      ) {
        throw new Error(
          "API key authentication requires 'value'.",
        );
      }

      return {
        type: "API_KEY",

        header:
          authentication.header,

        value:
          authentication.value,
      };
    }

    case "BASIC": {
      if (
        typeof authentication.username !==
        "string"
      ) {
        throw new Error(
          "Basic authentication requires 'username'.",
        );
      }

      if (
        typeof authentication.password !==
        "string"
      ) {
        throw new Error(
          "Basic authentication requires 'password'.",
        );
      }

      return {
        type: "BASIC",

        username:
          authentication.username,

        password:
          authentication.password,
      };
    }

    case "CUSTOM": {
      const headers =
        parseHeaders(
          authentication.headers,
        );

      return {
        type: "CUSTOM",

        headers,
      };
    }

    default:
      throw new Error(
        `Unsupported HTTP authentication type '${authentication.type}'.`,
      );
  }
}

// =============================================================================
// Headers
// =============================================================================

function parseHeaders(
  value: unknown,
): Record<string, string> {
  if (
    value === undefined ||
    value === null
  ) {
    return {};
  }

  if (
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new Error(
      "HTTP connector 'headers' must be an object.",
    );
  }

  const headers =
    value as Record<
      string,
      unknown
    >;

  const result:
    Record<string, string> = {};

  for (
    const [
      key,
      headerValue,
    ] of Object.entries(
      headers,
    )
  ) {
    if (
      typeof headerValue !==
      "string"
    ) {
      throw new Error(
        `HTTP connector header '${key}' must be a string.`,
      );
    }

    result[key] =
      headerValue;
  }

  return result;
}

// =============================================================================
// Numbers
// =============================================================================

function parsePositiveNumber(
  value: unknown,
  defaultValue: number,
  name: string,
): number {
  if (
    value === undefined
  ) {
    return defaultValue;
  }

  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    throw new Error(
      `HTTP connector configuration '${name}' must be a positive number.`,
    );
  }

  return value;
}