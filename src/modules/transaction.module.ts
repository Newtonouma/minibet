import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { HttpModule } from '@nestjs/axios';
import { TransactionController } from '../controllers/transaction.controller';
import { TransactionService } from '../services/transaction.service';
import { AirtelMoneyService } from '../services/airtel-money.service';
import { Transaction } from '../entities/transaction.entity';
import { User } from '../entities/user.entity';
import { Bet } from '../entities/bet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Transaction, User, Bet]), HttpModule],
  controllers: [TransactionController],
  providers: [TransactionService, AirtelMoneyService],
  exports: [TransactionService, AirtelMoneyService],
})
export class TransactionModule {}
