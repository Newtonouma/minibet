import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import {
  TransactionService,
  CreateTransactionDto,
} from '../services/transaction.service';
import { Transaction, TransactionType } from '../entities/transaction.entity';

export class DepositDto {
  userId: number;
  amount: number;
  msisdn: string;
  description?: string;
}

export class WithdrawalDto {
  userId: number;
  amount: number;
  msisdn: string;
  description?: string;
}

@Controller('transactions')
export class TransactionController {
  constructor(private readonly transactionService: TransactionService) {}

  @Get()
  async findAll(@Query('userId') userId?: string): Promise<Transaction[]> {
    if (userId) {
      return this.transactionService.findByUser(+userId);
    }
    return this.transactionService.findAll();
  }

  @Get(':id')
  async findOne(@Param('id') id: string): Promise<Transaction | null> {
    return this.transactionService.findOne(+id);
  }

  @Post('deposit')
  async initiateDeposit(@Body() depositDto: DepositDto): Promise<Transaction> {
    const createTransactionDto: CreateTransactionDto = {
      userId: depositDto.userId,
      amount: depositDto.amount,
      type: TransactionType.DEPOSIT,
      msisdn: depositDto.msisdn,
      description: depositDto.description || 'Deposit to betting account',
    };

    // Create the transaction
    const transaction = await this.transactionService.createTransaction(createTransactionDto);
    
    // Immediately process it with Airtel Money
    return this.transactionService.processDeposit(transaction.transactionId);
  }

  @Post('deposit/:transactionId/process')
  async processDeposit(
    @Param('transactionId') transactionId: string,
  ): Promise<Transaction> {
    return this.transactionService.processDeposit(transactionId);
  }

  @Post('withdrawal')
  async initiateWithdrawal(
    @Body() withdrawalDto: WithdrawalDto,
  ): Promise<Transaction> {
    console.log('=== STARTING WITHDRAWAL PROCESS ===');
    const createTransactionDto: CreateTransactionDto = {
      userId: withdrawalDto.userId,
      amount: withdrawalDto.amount,
      type: TransactionType.WITHDRAWAL,
      msisdn: withdrawalDto.msisdn,
      description:
        withdrawalDto.description || 'Withdrawal from betting account',
    };

    // Create the transaction
    console.log('Creating transaction...');
    const transaction = await this.transactionService.createTransaction(createTransactionDto);
    console.log(`Transaction created: ${transaction.transactionId}`);
    
    // Immediately process it with Airtel Money
    console.log('Processing withdrawal with Airtel Money...');
    const processedTransaction = await this.transactionService.processWithdrawal(transaction.transactionId);
    console.log('Withdrawal processing completed');
    
    return processedTransaction;
  }

  @Post('withdrawal/:transactionId/process')
  async processWithdrawal(
    @Param('transactionId') transactionId: string,
  ): Promise<Transaction> {
    return this.transactionService.processWithdrawal(transactionId);
  }
}
