import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { DatabaseModule } from './database/database.module.js';
import { HttpModule } from './http/http.module.js';
import { QueueModule } from './queue/queue.module.js';
@Module({
  imports: [ConfigModule, HttpModule, QueueModule, DatabaseModule],
  controllers: [],
  providers: [],
})
export class AppModule { }
