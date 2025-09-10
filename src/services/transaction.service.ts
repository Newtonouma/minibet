import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Transaction,
  TransactionType,
  TransactionStatus,
} from '../entities/transaction.entity';
import { User } from '../entities/user.entity';
import { AirtelMoneyService } from './airtel-money.service';
import { ConfigService } from '@nestjs/config';

export interface CreateTransactionDto {
  userId: number;
  amount: number;
  type: TransactionType;
  msisdn?: string;
  description?: string;
}

@Injectable()
export class TransactionService {
  private readonly logger = new Logger(TransactionService.name);

  constructor(
    @InjectRepository(Transaction)
    private transactionRepository: Repository<Transaction>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private airtelMoneyService: AirtelMoneyService,
    private configService: ConfigService,
  ) {}

  async createTransaction(
    createTransactionDto: CreateTransactionDto,
  ): Promise<Transaction> {
    const user = await this.userRepository.findOne({
      where: { id: createTransactionDto.userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    const transactionId = this.generateTransactionId();
    const reference = `MiniBet-${Date.now()}`;

    const transaction = this.transactionRepository.create({
      transactionId,
      type: createTransactionDto.type,
      amount: createTransactionDto.amount,
      currency: this.configService.get('AIRTEL_CURRENCY') || 'KES',
      reference,
      msisdn: createTransactionDto.msisdn || user.msisdn,
      description: createTransactionDto.description,
      user,
      userId: user.id,
      status: TransactionStatus.PENDING,
    });

    return this.transactionRepository.save(transaction);
  }

  async processDeposit(transactionId: string): Promise<Transaction> {
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId },
      relations: ['user'],
    });

    if (!transaction) {
      throw new NotFoundException('Transaction not found');
    }

    if (transaction.type !== TransactionType.DEPOSIT) {
      throw new BadRequestException('Invalid transaction type for deposit');
    }

    try {
      // Update transaction status to processing
      transaction.status = TransactionStatus.PROCESSING;
      await this.transactionRepository.save(transaction);

      // Initiate payment collection from Airtel Money
      const paymentResult = await this.airtelMoneyService.collectPayment({
        reference: transaction.reference,
        subscriber: {
          country: this.configService.get('AIRTEL_COUNTRY') || 'KE',
          currency: this.configService.get('AIRTEL_CURRENCY') || 'KES',
          msisdn: transaction.msisdn,
        },
        transaction: {
          amount: Number(transaction.amount),
          country: this.configService.get('AIRTEL_COUNTRY') || 'KE',
          currency: this.configService.get('AIRTEL_CURRENCY') || 'KES',
          id: transaction.transactionId,
        },
      });

      // Process the immediate response from Airtel Money
      const isSuccess = paymentResult.status?.success;
      const airtelStatus = paymentResult.data?.transaction?.status;
      
      // Update transaction based on Airtel Money response
      if (isSuccess && airtelStatus === 'TS') {
        transaction.status = TransactionStatus.COMPLETED;
        // Add to user balance only when successful
        transaction.user.balance =
          Number(transaction.user.balance) + Number(transaction.amount);
        await this.userRepository.save(transaction.user);
      } else if (airtelStatus === 'TF' || !isSuccess) {
        transaction.status = TransactionStatus.FAILED;
        // Don't add balance for failed transactions
      } else {
        transaction.status = TransactionStatus.PROCESSING;
        // Keep balance unchanged until final status is confirmed
      }

      transaction.airtelMoneyId =
        paymentResult.data?.transaction?.airtel_money_id || null;
      transaction.airtelReferenceId =
        paymentResult.data?.transaction?.reference_id || null;

      return this.transactionRepository.save(transaction);
    } catch (error) {
      transaction.status = TransactionStatus.FAILED;
      await this.transactionRepository.save(transaction);
      throw error;
    }
  }

  async processWithdrawal(transactionId: string): Promise<Transaction> {
    this.logger.log(`=== PROCESSING WITHDRAWAL ===`);
    this.logger.log(`Transaction ID: ${transactionId}`);
    
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId },
      relations: ['user'],
    });

    if (!transaction) {
      this.logger.error(`Transaction not found: ${transactionId}`);
      throw new NotFoundException('Transaction not found');
    }

    this.logger.log(`Found transaction: ${JSON.stringify({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount,
      status: transaction.status,
      userBalance: transaction.user.balance
    }, null, 2)}`);

    if (transaction.type !== TransactionType.WITHDRAWAL) {
      throw new BadRequestException('Invalid transaction type for withdrawal');
    }

    // Check if user has sufficient balance
    if (Number(transaction.user.balance) < Number(transaction.amount)) {
      transaction.status = TransactionStatus.FAILED;
      await this.transactionRepository.save(transaction);
      throw new BadRequestException('Insufficient balance');
    }

    try {
      // Update transaction status to processing
      transaction.status = TransactionStatus.PROCESSING;
      await this.transactionRepository.save(transaction);

      // Disburse funds via Airtel Money
      const disbursementResult = await this.airtelMoneyService.disburseFunds({
        payee: {
          currency: this.configService.get('AIRTEL_CURRENCY') || 'KES',
          msisdn: transaction.msisdn,
        },
        reference: transaction.reference,
        pin: this.configService.get('AIRTEL_PIN') || '',
        transaction: {
          amount: Number(transaction.amount),
          id: transaction.transactionId,
          type: 'B2C',
        },
      });

      // Process the immediate response from Airtel Money
      const isSuccess = disbursementResult.status.success;
      const airtelStatus = disbursementResult.data.transaction.status;
      
      // Update transaction based on Airtel Money response
      if (isSuccess && airtelStatus === 'TS') {
        transaction.status = TransactionStatus.COMPLETED;
        // Deduct amount from user balance only when successful
        transaction.user.balance =
          Number(transaction.user.balance) - Number(transaction.amount);
        await this.userRepository.save(transaction.user);
      } else if (airtelStatus === 'TF' || !isSuccess) {
        transaction.status = TransactionStatus.FAILED;
        // Don't deduct balance for failed transactions
      } else {
        transaction.status = TransactionStatus.PROCESSING;
        // Keep balance unchanged until final status is confirmed
      }

      transaction.airtelMoneyId =
        disbursementResult.data.transaction.airtel_money_id;
      transaction.airtelReferenceId =
        disbursementResult.data.transaction.reference_id;

      return this.transactionRepository.save(transaction);
    } catch (error) {
      transaction.status = TransactionStatus.FAILED;
      await this.transactionRepository.save(transaction);
      throw error;
    }
  }

  async findAll(): Promise<Transaction[]> {
    return this.transactionRepository.find({
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findByUser(userId: number): Promise<Transaction[]> {
    return this.transactionRepository.find({
      where: { userId },
      relations: ['user'],
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: number): Promise<Transaction | null> {
    return this.transactionRepository.findOne({
      where: { id },
      relations: ['user'],
    });
  }

  private generateTransactionId(): string {
    return `TXN${Date.now()}${Math.random().toString(36).substring(2, 9).toUpperCase()}`;
  }
}
