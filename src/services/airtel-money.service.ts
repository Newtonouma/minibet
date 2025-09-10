import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';

export interface AirtelAuthResponse {
  token_type: string;
  access_token: string;
  expires_in: number;
}

export interface DisbursementRequest {
  payee: {
    currency: string;
    msisdn: string;
  };
  reference: string;
  pin: string;
  transaction: {
    amount: number;
    id: string;
    type: string;
  };
}

export interface DisbursementResponse {
  data: {
    transaction: {
      reference_id: string;
      airtel_money_id: string;
      id: string;
      status: string;
    };
  };
  status: {
    response_code: string;
    code: string;
    success: boolean;
    result_code: string;
    message: string;
  };
}

export interface PaymentRequest {
  reference: string;
  subscriber: {
    country: string;
    currency: string;
    msisdn: string;
  };
  transaction: {
    amount: number;
    country: string;
    currency: string;
    id: string;
  };
}

@Injectable()
export class AirtelMoneyService {
  private readonly logger = new Logger(AirtelMoneyService.name);
  private accessToken: string | null = null;
  private tokenExpiryTime: Date | null = null;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  private async getAccessToken(): Promise<string> {
    if (
      this.accessToken &&
      this.tokenExpiryTime &&
      new Date() < this.tokenExpiryTime
    ) {
      return this.accessToken;
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post<AirtelAuthResponse>(
          `${this.configService.get('AIRTEL_API_BASE_URL')}/auth/oauth2/token?Content-Type=application%2Fjson&Accept=application%2Fjson`,
          {
            client_id: this.configService.get('AIRTEL_CLIENT_ID'),
            client_secret: this.configService.get('AIRTEL_CLIENT_SECRET'),
            grant_type: 'client_credentials',
          },
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: 'application/json',
            },
          },
        ),
      );

      this.accessToken = response.data.access_token;
      // Set expiry time to 30 seconds before actual expiry
      this.tokenExpiryTime = new Date(
        Date.now() + (response.data.expires_in - 30) * 1000,
      );

      this.logger.log('Successfully obtained Airtel Money access token');
      return this.accessToken;
    } catch (error) {
      this.logger.error(
        'Failed to get access token:',
        error.response?.data || error.message,
      );
      throw new Error('Failed to authenticate with Airtel Money API');
    }
  }

  async disburseFunds(
    disbursementData: DisbursementRequest,
  ): Promise<DisbursementResponse> {
    this.logger.log('=== STARTING DISBURSEMENT PROCESS ===');
    this.logger.log(`Disbursement Data: ${JSON.stringify(disbursementData, null, 2)}`);
    
    const accessToken = await this.getAccessToken();

    try {
      const response = await firstValueFrom(
        this.httpService.post<DisbursementResponse>(
          `${this.configService.get('AIRTEL_API_BASE_URL')}/standard/v2/disbursements/`,
          disbursementData,
          {
            headers: {
              Accept: '*/*',
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Country': this.configService.get('AIRTEL_COUNTRY'),
              'X-Currency': this.configService.get('AIRTEL_CURRENCY'),
            },
          },
        ),
      );

      // Log the complete Airtel Money disbursement response
      this.logger.log('=== AIRTEL MONEY DISBURSEMENT RESPONSE ===');
      this.logger.log(`Transaction ID: ${disbursementData.transaction.id}`);
      this.logger.log(`Full Response: ${JSON.stringify(response.data, null, 2)}`);
      this.logger.log('==========================================');

      this.logger.log(
        `Disbursement successful: ${response.data.status.message}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        'Disbursement failed:',
        error.response?.data || error.message,
      );
      throw new Error('Failed to disburse funds via Airtel Money');
    }
  }

  async collectPayment(paymentData: PaymentRequest): Promise<any> {
    const accessToken = await this.getAccessToken();

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.get('AIRTEL_API_BASE_URL')}/merchant/v1/payments/`,
          paymentData,
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: '*/*',
              'X-Country': this.configService.get('AIRTEL_COUNTRY'),
              'X-Currency': this.configService.get('AIRTEL_CURRENCY'),
              Authorization: `Bearer ${accessToken}`,
            },
          },
        ),
      );

      // Log the complete Airtel Money payment response
      this.logger.log('=== AIRTEL MONEY PAYMENT RESPONSE ===');
      this.logger.log(`Transaction ID: ${paymentData.transaction.id}`);
      this.logger.log(`Full Response: ${JSON.stringify(response.data, null, 2)}`);
      this.logger.log('=====================================');

      this.logger.log(
        `Payment collection initiated: ${JSON.stringify(response.data)}`,
      );
      return response.data;
    } catch (error) {
      this.logger.error(
        'Payment collection failed:',
        error.response?.data || error.message,
      );
      throw new Error('Failed to collect payment via Airtel Money');
    }
  }
}
