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
    type: string; // e.g., B2C
  };
}

export interface DisbursementResponse {
  data: {
    transaction: {
      reference_id: string;
      airtel_money_id: string;
      id: string;
      status: string; // TS (success), TF (failed) or textual statuses
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
    // Use cached token if not expired
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
          `${this.configService.get<string>('AIRTEL_API_BASE_URL')}/auth/oauth2/token?Content-Type=application%2Fjson&Accept=application%2Fjson`,
          {
            client_id: this.configService.get<string>('AIRTEL_CLIENT_ID'),
            client_secret: this.configService.get<string>('AIRTEL_CLIENT_SECRET'),
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
    } catch (error: any) {
      this.logger.error(
        'Failed to get access token:',
        JSON.stringify(error?.response?.data ?? error?.message),
      );
      throw new Error('Failed to authenticate with Airtel Money API');
    }
  }

  async disburseFunds(
    disbursementData: DisbursementRequest,
  ): Promise<DisbursementResponse> {
    const accessToken = await this.getAccessToken();

    // Log the payload being sent to Airtel Money
    this.logger.log('=== AIRTEL MONEY DISBURSEMENT REQUEST ===');
    this.logger.log(`Payload: ${JSON.stringify(disbursementData, null, 2)}`);
    this.logger.log(`Country: ${this.configService.get<string>('AIRTEL_COUNTRY') ?? 'KE'}`);
    this.logger.log(`Currency: ${this.configService.get<string>('AIRTEL_CURRENCY') ?? 'KES'}`);
    this.logger.log('==========================================');

    try {
      const response = await firstValueFrom(
        this.httpService.post<DisbursementResponse>(
          `${this.configService.get<string>('AIRTEL_API_BASE_URL')}/standard/v2/disbursements/`,
          disbursementData,
          {
            headers: {
              Accept: '*/*',
              Authorization: `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
              'X-Country': this.configService.get<string>('AIRTEL_COUNTRY') ?? 'KE',
              'X-Currency': this.configService.get<string>('AIRTEL_CURRENCY') ?? 'KES',
            },
          },
        ),
      );

      // Log the complete Airtel Money disbursement response
      this.logger.log('=== AIRTEL MONEY DISBURSEMENT RESPONSE ===');
      this.logger.log(`Full Response: ${JSON.stringify(response.data, null, 2)}`);
      this.logger.log('==========================================');

      return response.data;
    } catch (error: any) {
      this.logger.error(
        'Disbursement failed:',
        JSON.stringify(error?.response?.data ?? error?.message),
      );
      throw new Error('Failed to disburse funds via Airtel Money');
    }
  }

  async collectPayment(paymentData: PaymentRequest & { callback_url?: string }): Promise<any> {
    const accessToken = await this.getAccessToken();

    // Ensure callback_url is included
    if (!paymentData.callback_url) {
      paymentData.callback_url = this.configService.get<string>('CALLBACK_URL');
    }

    try {
      const response = await firstValueFrom(
        this.httpService.post(
          `${this.configService.get<string>('AIRTEL_API_BASE_URL')}/merchant/v1/payments/`,
          paymentData,
          {
            headers: {
              'Content-Type': 'application/json',
              Accept: '*/*',
              'X-Country': this.configService.get<string>('AIRTEL_COUNTRY') ?? 'KE',
              'X-Currency': this.configService.get<string>('AIRTEL_CURRENCY') ?? 'KES',
              Authorization: `Bearer ${accessToken}`,
            },
          },
        ),
      );

      // Log the complete Airtel Money payment response
      this.logger.log('=== AIRTEL MONEY PAYMENT RESPONSE ===');
      this.logger.log(`Full Response: ${JSON.stringify(response.data, null, 2)}`);
      this.logger.log('=====================================');

      return response.data;
    } catch (error: any) {
      this.logger.error(
        'Payment collection failed:',
        JSON.stringify(error?.response?.data ?? error?.message),
      );
      throw new Error('Failed to collect payment via Airtel Money');
    }
  }
}
