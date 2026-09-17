import { AfricasTalkingHttpSmsProvider } from "../implementations/africastalking/africastalking-http-sms-provider.js";
import { ClickMobileAngolaHttpSmsProvider } from "../implementations/clickmobile/clickmobile-http-sms-provider.js";
import { OnfoneKenyaHttpSmsProvider } from "../implementations/onfone/onfone-http-sms-provider.js";
import { RouteMobileHttpSmsProvider } from "../implementations/routemobile/routemobile-http-sms-provider.js";

export const HTTP_SMS_PROVIDERS = [
  RouteMobileHttpSmsProvider,
  AfricasTalkingHttpSmsProvider,
  ClickMobileAngolaHttpSmsProvider,
  OnfoneKenyaHttpSmsProvider
];