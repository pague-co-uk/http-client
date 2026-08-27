import {
  Inject,
  Injectable,
} from "@nestjs/common";

import {
  ConnectorStatus,
  ConnectorTransport,
} from "@prisma/client";

import {
  DATABASE,
} from "../../database/database.constants.js";

import {
  DatabaseRepository,
} from "../../database/database.repository.js";

import type {
  Database,
} from "../../database/database.repository.js";

@Injectable()
export class HttpRepository
  extends DatabaseRepository {
  constructor(
    @Inject(DATABASE)
    db: Database,
  ) {
    super(db);
  }

  // ===========================================================================
  // Message
  // ===========================================================================

  async findMessageForSubmission(
    messageId: string,
  ) {
    return this.db.message.findUnique({
      where: {
        id: messageId,
      },

      include: {
        senderId: true,
      },
    });
  }

  // ===========================================================================
  // Routing attempt
  // ===========================================================================

  async findAttempt(
    attemptId: string,
  ) {
    return this.db.messageRouteAttempt.findUnique({
      where: {
        id: attemptId,
      },
    });
  }

  // ===========================================================================
  // Connector
  // ===========================================================================

  async findConnector(
    connectorId: string,
  ) {
    return this.db.connector.findUnique({
      where: {
        id: connectorId,
      },
    });
  }

  // ===========================================================================
  // Active HTTP connectors
  // ===========================================================================

  async findActiveHttpConnectors() {
    return this.db.connector.findMany({
      where: {
        status:
          ConnectorStatus.ACTIVE,

        transport:
          ConnectorTransport.HTTP,
      },

      orderBy: {
        code: "asc",
      },
    });
  }
}