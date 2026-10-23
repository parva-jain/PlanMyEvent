import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { cleanupOpenApiDoc } from 'nestjs-zod';

/** OpenAPI 3.1 generated from the Zod contracts, served at /v1/docs outside production. */
export function setupOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Plan My Event API')
    .setVersion('v1')
    .setOpenAPIVersion('3.1.0')
    .addServer('/')
    .build();
  const document = cleanupOpenApiDoc(SwaggerModule.createDocument(app, config), { version: '3.1' });
  SwaggerModule.setup('v1/docs', app, document, { jsonDocumentUrl: 'v1/docs/openapi.json' });
}
