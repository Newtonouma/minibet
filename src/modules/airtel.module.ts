import { Module } from '@nestjs/common';
import { AirtelController } from '../controllers/airtel.controller';
import { AirtelMoneyService } from '../services/airtel-money.service';
import { ConfigModule } from '@nestjs/config';
import { HttpModule } from '@nestjs/axios';

@Module({
  imports: [ConfigModule, HttpModule],
  controllers: [AirtelController],
  providers: [AirtelMoneyService],
  exports: [AirtelMoneyService],
})
export class AirtelModule {}
