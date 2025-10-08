import { Controller, Post, Body, Req, Res, HttpStatus } from '@nestjs/common';
import { AirtelMoneyService } from '../services/airtel-money.service';
import { TransactionService } from '../services/transaction.service';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';

@Controller('airtel')
export class AirtelController {
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
    // Log the full payload
    console.log('Airtel Callback Payload:', JSON.stringify(req.body, null, 2));

    // Forward callback to TransactionService to handle DB updates
    try {
      await this.transactionService.handleAirtelCallback(req.body);
    } catch (err) {
      console.error('Error handling Airtel callback:', err);
      // Still respond 200 to Airtel, but log for investigation
    }

    // Respond immediately with HTTP 200
    const response = { message: 'Callback received successfully' };
    console.log('Airtel Callback Response:', JSON.stringify(response));
    return res.status(HttpStatus.OK).json(response);
  }
}
