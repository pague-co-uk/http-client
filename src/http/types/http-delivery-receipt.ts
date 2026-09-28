export type HttpDeliveryReceiptStatus =
  | "DELIVERED"
  | "FAILED";

export interface HttpDeliveryReceipt<
  TRawData = Record<string, unknown>,
> {
  providerMessageId: string;

  status:
  HttpDeliveryReceiptStatus;

  submittedAt: Date;

  completedAt: Date;

  errorCode?: string;

  errorMessage?: string;

  rawData?: TRawData;
}