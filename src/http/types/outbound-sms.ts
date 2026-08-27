import type {
  MessageEncoding,
} from "@prisma/client";

export interface OutboundSms {
  messageId: string;
  publicId?: string;
  clientId: string;

  sender: string;

  destination: string;

  body: string;

  encoding: MessageEncoding;

  segmentCount: number;
}