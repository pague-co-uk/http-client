import {
  SetMetadata,
} from "@nestjs/common";

export const HTTP_SMS_PROVIDER =
  Symbol(
    "HTTP_SMS_PROVIDER",
  );

export function HttpSmsProvider(
  ...codes: string[]
): ClassDecorator {

  if (
    codes.length === 0
  ) {
    throw new Error(
      "At least one HTTP SMS provider code must be specified.",
    );
  }

  const normalizedCodes =
    codes.map(
      (code) => code.trim(),
    );

  if (
    normalizedCodes.some(
      (code) => !code,
    )
  ) {
    throw new Error(
      "HTTP SMS provider codes cannot be empty.",
    );
  }

  const uniqueCodes =
    [
      ...new Set(
        normalizedCodes,
      ),
    ];

  return SetMetadata(
    HTTP_SMS_PROVIDER,
    uniqueCodes,
  );
}