import { Controller, Post, Get, Body, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import { AirtelMoneyService } from '../services/airtel-money.service';
import { TransactionService } from '../services/transaction.service';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';

@Controller('airtel')
export class AirtelController {
  private readonly logger = new Logger(AirtelController.name);
  constructor(
    private readonly airtelMoneyService: AirtelMoneyService,
    private readonly configService: ConfigService,
    private readonly transactionService: TransactionService,
  ) {}

  @Post('collect')
  async collectPayment(@Body() body: any, @Res() res: Response) {
    // Add callback_url to the request body
    const callbackUrl = this.configService.get<string>('CALLBACK_URL');
    const requestBody = {
      ...body,
      callback_url: callbackUrl,
    };
    const result = await this.airtelMoneyService.collectPayment(requestBody);
    return res.status(HttpStatus.OK).json(result);
  }

  @Post('callback')
  async airtelCallback(@Req() req: Request, @Res() res: Response) {
    // Validate Content-Type header
    const contentType = req.header('content-type') || req.header('Content-Type');
    if (!contentType || !contentType.includes('application/json')) {
      this.logger && this.logger.warn
        ? this.logger.warn('Callback received with invalid Content-Type: ' + contentType)
        : console.warn('Callback received with invalid Content-Type:', contentType);
      // Still respond 200 (Airtel expects 200), but log the issue
    }

  // Log incoming raw payload for debugging
  this.logger.log('Airtel Callback Payload (raw): ' + JSON.stringify(req.body, null, 2));

    // Normalize payload to the internal shape expected by TransactionService.handleAirtelCallback
    // Airtel spec for "Callback Without Authentication":
    // {
    //   transaction: { id, message, status_code, airtel_money_id }
    // }
    const incoming = req.body || {};
    let normalizedPayload: any = incoming;

    // Support both payload shapes:
    // 1) { transaction: { ... } }
    // 2) { data: { transaction: { ... } } }
    const tx = incoming.transaction || incoming.data?.transaction;

    if (tx) {

      // Build normalized structure: { data: { transaction: { ... } }, status: { success, message } }
      const statusCode = (tx.status_code || tx.transaction_status || '').toString();
      const isSuccess = statusCode === 'TS';

      normalizedPayload = {
        data: {
          transaction: {
            id: tx.id || tx.transaction_id || tx.transactionId,
            reference_id: tx.reference_id || tx.reference || undefined,
            airtel_money_id: tx.airtel_money_id,
            amount: tx.amount !== undefined ? Number(tx.amount) : undefined,
            currency: tx.currency,
            msisdn: tx.msisdn || tx.msisdn_number || undefined,
            // keep original status text as well
            status: isSuccess ? 'SUCCESS' : tx.message || tx.status_code,
          },
        },
        status: {
          success: isSuccess,
          message: tx.message || (isSuccess ? 'SUCCESS' : 'FAILED'),
          response_code: tx.status_code,
        },
      } as any;
    }
    // Forward normalized payload to TransactionService to handle DB updates
    try {
      await this.transactionService.handleAirtelCallback(normalizedPayload);
    } catch (err) {
      this.logger.error('Error handling Airtel callback: ' + (err?.message || err));
      // Still respond 200 to Airtel, but log for investigation
    }

    // Log the normalized payload (what was forwarded to the service)
    this.logger.log('Airtel Callback Normalized Payload: ' + JSON.stringify(normalizedPayload, null, 2));

    // Respond with HTTP 200 and no JSON body (Airtel only requires 200)
    res.status(HttpStatus.OK).send();
    return;
  }
}
