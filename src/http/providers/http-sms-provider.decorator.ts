import {
  SetMetadata,
} from "@nestjs/common";

export const HTTP_SMS_PROVIDER =
  Symbol(
    "HTTP_SMS_PROVIDER",
  );

export function HttpSmsProvider(
  code: string,
): ClassDecorator {
  if (!code.trim()) {
    throw new Error(
      "HTTP SMS provider code cannot be empty.",
    );
  }

  return SetMetadata(
    HTTP_SMS_PROVIDER,
    code,
  );
}