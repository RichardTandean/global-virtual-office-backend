import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  Logger,
} from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';

@Catch()
export class I18nExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(I18nExceptionFilter.name);

  constructor(private readonly i18n: I18nService) {}

  async catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();
    const request = ctx.getRequest();

    let status = 500;
    let messageKey = 'errors.internalServerError';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resBody = exception.getResponse();

      if (typeof resBody === 'string') {
        messageKey = resBody;
      } else if (typeof resBody === 'object' && resBody !== null) {
        const body = resBody as any;
        if (body.message && typeof body.message === 'string') {
          messageKey = body.message;
        } else if (Array.isArray(body.message)) {
          messageKey = body.message[0] || messageKey;
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(`Unhandled exception: ${exception.message}`, exception.stack);
      messageKey = 'errors.internalServerError';
    }

    const acceptLang = request.headers['accept-language'] || '';
    const preferredLang = acceptLang.split(',')[0]?.split(';')[0]?.trim() || 'id';
    const lang = ['en', 'id', 'ko'].includes(preferredLang) ? preferredLang : 'id';

    let translated: string;
    try {
      const parts = messageKey.split('.');
      if (parts.length >= 2 && parts[0] === 'errors') {
        translated = this.i18n.translate(messageKey, { lang });
      } else if (messageKey.startsWith('notifications.')) {
        translated = this.i18n.translate(messageKey, { lang });
      } else if (messageKey.startsWith('common.')) {
        translated = this.i18n.translate(messageKey, { lang });
      } else {
        translated = this.i18n.translate(`errors.${messageKey}`, {
          lang,
          defaultValue: messageKey,
        });
      }
    } catch {
      translated = messageKey;
    }

    const body: any = {
      statusCode: status,
      message: translated,
    };

    if (status === 400) {
      body.error = 'Bad Request';
    } else if (status === 401) {
      body.error = 'Unauthorized';
    } else if (status === 403) {
      body.error = 'Forbidden';
    } else if (status === 404) {
      body.error = 'Not Found';
    } else if (status === 409) {
      body.error = 'Conflict';
    } else {
      body.error = 'Internal Server Error';
    }

    response.status(status).json(body);
  }
}
