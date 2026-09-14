import {
  Body,
  Controller,
  Get,
  Post,
  Query,
} from "@nestjs/common";

import {
  HttpDlrService,
} from "./http-dlr.service.js";

@Controller("dlr")
export class HttpDlrController {
  constructor(
    private readonly dlr:
      HttpDlrService,
  ) { }

  // ===========================================================================
  // GET DLR
  // ===========================================================================

  @Get()
  async receiveDlrGet(
    @Query()
    query: Record<
      string,
      string | string[]
    >,
  ): Promise<void> {
    await this.dlr.process(
      this.coalescePayload(
        query,
      ),
    );
  }

  // ===========================================================================
  // POST DLR
  // ===========================================================================

  @Post()
  async receiveDlrPost(
    @Query()
    query: Record<
      string,
      string | string[]
    >,

    @Body()
    body: unknown,
  ): Promise<void> {
    await this.dlr.process(
      this.coalescePayload(
        query,
        body,
      ),
    );
  }

  // ===========================================================================
  // Coalesce request parameters
  // ===========================================================================

  private coalescePayload(
    query: Record<
      string,
      string | string[]
    >,
    body?: unknown,
  ): Record<string, unknown> {
    const payload: Record<
      string,
      unknown
    > = {
      ...query,
    };

    if (
      body &&
      typeof body === "object" &&
      !Array.isArray(body)
    ) {
      Object.assign(
        payload,
        body as Record<
          string,
          unknown
        >,
      );
    }

    return payload;
  }
}