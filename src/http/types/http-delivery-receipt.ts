export type HttpDeliveryReceiptStatus =
  | "DELIVERED"
  | "FAILED"
  | "UNKNOWN";

export interface HttpDeliveryReceipt<
  TRawData = Record<string, unknown>,
> {
  connectorId?: string;

  providerMessageId: string;

  status: HttpDeliveryReceiptStatus;

  errorCode?: string;

  errorMessage?: string;

  rawData?: TRawData;
}