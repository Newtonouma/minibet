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
    const reference = `MiniBet${Date.now()}`; // Remove hyphen for Airtel compatibility

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

      this.logger.log(`Starting deposit process for transaction: ${transaction.transactionId}`);

      // Normalize the MSISDN for Airtel compatibility
      const normalizedMsisdn = this.normalizeKenyaMsisdn(transaction.msisdn);
      this.logger.log(`Original MSISDN: ${transaction.msisdn}, Normalized: ${normalizedMsisdn}`);

      // Collect payment via Airtel Money
      const paymentResult = await this.airtelMoneyService.collectPayment({
        reference: transaction.reference,
        subscriber: {
          country: this.configService.get('AIRTEL_COUNTRY') || 'KE',
          currency: this.configService.get('AIRTEL_CURRENCY') || 'KES',
          msisdn: normalizedMsisdn,
        },
        transaction: {
          amount: Math.abs(Number(transaction.amount)), // Use absolute value for Airtel Money
          country: this.configService.get('AIRTEL_COUNTRY') || 'KE',
          currency: this.configService.get('AIRTEL_CURRENCY') || 'KES',
          id: transaction.transactionId,
        },
      });

      // Log the complete Airtel Money payment response
      this.logger.log('=== AIRTEL MONEY PAYMENT COLLECTION RESPONSE ===');
      this.logger.log(`Transaction ID: ${transaction.transactionId}`);
      this.logger.log(`Full Response: ${JSON.stringify(paymentResult, null, 2)}`);
      this.logger.log('================================================');

      // Store the normalized MSISDN for future reference
      transaction.msisdn = normalizedMsisdn;

      // Update transaction with response data
      // Use fallback values if the API doesn't provide them
      transaction.airtelMoneyId = paymentResult.data?.transaction?.airtel_money_id || 
                                  paymentResult.data?.transaction?.id || 
                                  `AM_${transaction.transactionId}`;
      transaction.airtelReferenceId = paymentResult.data?.transaction?.reference_id || 
                                      transaction.reference;

      // Determine transaction status based on response
      const airtelStatus = paymentResult.data?.transaction?.status;
      const isSuccess = paymentResult.status?.success;

      this.logger.log(`Airtel Money Payment Status: ${airtelStatus}, Success: ${isSuccess}`);

      if (isSuccess && (airtelStatus === 'TS' || airtelStatus === 'SUCCESS')) {
        // Payment successful
        transaction.status = TransactionStatus.COMPLETED;
        
        // Add amount to user balance only if payment is successful
        transaction.user.balance = Number(transaction.user.balance) + Number(transaction.amount);
        await this.userRepository.save(transaction.user);
        
        this.logger.log(`Deposit successful for transaction: ${transaction.transactionId}`);
        this.logger.log(`Amount ${transaction.amount} ${transaction.currency} added to user balance`);
        this.logger.log(`New user balance: ${transaction.user.balance}`);
      } else if (airtelStatus === 'TF' || airtelStatus === 'FAILED' || isSuccess === false) {
        // Payment failed
        transaction.status = TransactionStatus.FAILED;
        this.logger.error(`Deposit failed for transaction: ${transaction.transactionId}`);
        this.logger.error(`Airtel Money Status: ${airtelStatus}`);
        this.logger.error(`Response Message: ${paymentResult.status?.message}`);
      } else {
        // For any other status, mark as completed if success is true
        if (isSuccess) {
          transaction.status = TransactionStatus.COMPLETED;
          transaction.user.balance = Number(transaction.user.balance) + Number(transaction.amount);
          await this.userRepository.save(transaction.user);
          this.logger.log(`Deposit completed (alternative status) for transaction: ${transaction.transactionId}`);
        } else {
          // Payment in progress or unknown status
          transaction.status = TransactionStatus.PROCESSING;
          this.logger.log(`Deposit processing for transaction: ${transaction.transactionId}`);
          this.logger.log(`Airtel Money Status: ${airtelStatus}`);
        }
      }

      // Log what we're about to save to the database
      this.logger.log('=== SAVING DEPOSIT TRANSACTION TO DATABASE ===');
      this.logger.log(`Transaction ID: ${transaction.transactionId}`);
      this.logger.log(`Status: ${transaction.status}`);
      this.logger.log(`Airtel Money ID: ${transaction.airtelMoneyId}`);
      this.logger.log(`Airtel Reference ID: ${transaction.airtelReferenceId}`);
      this.logger.log(`MSISDN: ${transaction.msisdn}`);
      this.logger.log(`User Balance: ${transaction.user.balance}`);
      this.logger.log('===========================================');

      return this.transactionRepository.save(transaction);
    } catch (error) {
      this.logger.error(`Deposit error for transaction: ${transaction.transactionId}`, error);
      transaction.status = TransactionStatus.FAILED;
      await this.transactionRepository.save(transaction);
      throw error;
    }
  }

  async processWithdrawal(transactionId: string): Promise<Transaction> {
    console.log(`=== PROCESS WITHDRAWAL CALLED FOR: ${transactionId} ===`);
    
    const transaction = await this.transactionRepository.findOne({
      where: { transactionId },
      relations: ['user'],
    });

    if (!transaction) {
      console.log('Transaction not found!');
      throw new NotFoundException('Transaction not found');
    }

    console.log(`Found transaction: ${transaction.transactionId}, status: ${transaction.status}`);

    if (transaction.type !== TransactionType.WITHDRAWAL) {
      console.log('Invalid transaction type!');
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

      this.logger.log(`Starting withdrawal process for transaction: ${transaction.transactionId}`);

      // Normalize the MSISDN for Airtel compatibility
      const normalizedMsisdn = this.normalizeKenyaMsisdn(transaction.msisdn);
      this.logger.log(`Original MSISDN: ${transaction.msisdn}, Normalized: ${normalizedMsisdn}`);

      // Calculate positive amount for Airtel Money
      const airtelAmount = Math.abs(Number(transaction.amount));
      this.logger.log(`Transaction amount: ${transaction.amount}, Airtel amount: ${airtelAmount}`);
      this.logger.log(`Reference: ${transaction.reference}`);

      // Disburse funds via Airtel Money
      const disbursementResult = await this.airtelMoneyService.disburseFunds({
        payee: {
          currency: this.configService.get('AIRTEL_CURRENCY') || 'KES',
          msisdn: normalizedMsisdn,
        },
        reference: transaction.reference,
        pin: this.configService.get('AIRTEL_PIN') || '',
        transaction: {
          amount: airtelAmount, // Use the calculated positive amount
          id: transaction.transactionId,
          type: 'B2C',
        },
      });

      // Log the complete Airtel Money disbursement response
      this.logger.log('=== AIRTEL MONEY DISBURSEMENT RESPONSE ===');
      this.logger.log(`Transaction ID: ${transaction.transactionId}`);
      this.logger.log(`Full Response: ${JSON.stringify(disbursementResult, null, 2)}`);
      this.logger.log('==========================================');

      // Extract response data
      const responseData = disbursementResult.data;
      const responseStatus = disbursementResult.status;

      // Store the normalized MSISDN for future reference
      transaction.msisdn = normalizedMsisdn;

      // Update transaction with all available data from Airtel Money response
      // Use fallback values if the API doesn't provide them
      transaction.airtelMoneyId = responseData?.transaction?.airtel_money_id || 
                                  responseData?.transaction?.id || 
                                  `AM_${transaction.transactionId}`;
      transaction.airtelReferenceId = responseData?.transaction?.reference_id || 
                                      transaction.reference;

      // Determine transaction status based on Airtel Money response
      const airtelStatus = responseData?.transaction?.status;
      const isSuccess = responseStatus?.success;

      this.logger.log(`Airtel Money Status: ${airtelStatus}, Success: ${isSuccess}`);

      if (isSuccess && (airtelStatus === 'TS' || airtelStatus === 'SUCCESS')) {
        // Transaction successful
        transaction.status = TransactionStatus.COMPLETED;
        
        // Deduct amount from user balance only if transaction is successful
        transaction.user.balance = Number(transaction.user.balance) - Number(transaction.amount);
        await this.userRepository.save(transaction.user);
        
        this.logger.log(`Withdrawal successful for transaction: ${transaction.transactionId}`);
        this.logger.log(`Amount ${transaction.amount} ${transaction.currency} deducted from user balance`);
        this.logger.log(`New user balance: ${transaction.user.balance}`);
      } else if (airtelStatus === 'TF' || airtelStatus === 'FAILED' || isSuccess === false) {
        // Transaction failed
        transaction.status = TransactionStatus.FAILED;
        this.logger.error(`Withdrawal failed for transaction: ${transaction.transactionId}`);
        this.logger.error(`Airtel Money Status: ${airtelStatus}`);
        this.logger.error(`Response Message: ${responseStatus?.message}`);
      } else {
        // For any other status, mark as completed if success is true
        // This handles cases where status might be different but success is true
        if (isSuccess) {
          transaction.status = TransactionStatus.COMPLETED;
          transaction.user.balance = Number(transaction.user.balance) - Number(transaction.amount);
          await this.userRepository.save(transaction.user);
          this.logger.log(`Withdrawal completed (alternative status) for transaction: ${transaction.transactionId}`);
        } else {
          // Transaction in progress or unknown status
          transaction.status = TransactionStatus.PROCESSING;
          this.logger.log(`Withdrawal processing for transaction: ${transaction.transactionId}`);
          this.logger.log(`Airtel Money Status: ${airtelStatus}`);
        }
      }

      // Log what we're about to save to the database
      this.logger.log('=== SAVING WITHDRAWAL TRANSACTION TO DATABASE ===');
      this.logger.log(`Transaction ID: ${transaction.transactionId}`);
      this.logger.log(`Status: ${transaction.status}`);
      this.logger.log(`Airtel Money ID: ${transaction.airtelMoneyId}`);
      this.logger.log(`Airtel Reference ID: ${transaction.airtelReferenceId}`);
      this.logger.log(`MSISDN: ${transaction.msisdn}`);
      this.logger.log(`User Balance: ${transaction.user.balance}`);
      this.logger.log('===============================================');

      return this.transactionRepository.save(transaction);
    } catch (error) {
      this.logger.error(`Withdrawal error for transaction: ${transaction.transactionId}`, error);
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

  // Normalize MSISDN for Kenya - Airtel may expect different formats
  private normalizeKenyaMsisdn(msisdn: string): string {
    if (!msisdn) return '';
    
    // Remove any non-digit characters
    const cleaned = msisdn.replace(/\D/g, '');
    
    // For Kenya, try the local format first (without country code)
    if (cleaned.startsWith('254')) {
      // Remove 254 and return local format: 7XXXXXXXX
      return cleaned.substring(3);
    } else if (cleaned.startsWith('0')) {
      // Format: 07XXXXXXXX -> 7XXXXXXXX
      return cleaned.substring(1);
    } else if (cleaned.startsWith('7') && cleaned.length === 9) {
      // Already in local format: 7XXXXXXXX
      return cleaned;
    } else if (cleaned.length === 9 && !cleaned.startsWith('7')) {
      // Format: Other 9-digit number, check if valid
      return cleaned;
    }
    
    // If none of the above, try to extract the last 9 digits if it starts with 7
    if (cleaned.length >= 9) {
      const last9 = cleaned.substring(cleaned.length - 9);
      if (last9.startsWith('7')) {
        return last9;
      }
    }
    
    // Default: return as is
    return cleaned;
  }
}
