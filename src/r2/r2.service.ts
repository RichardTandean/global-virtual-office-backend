import { Injectable, Logger } from '@nestjs/common';
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class R2Service {
  private readonly logger = new Logger(R2Service.name);
  private readonly s3Client: S3Client;
  private readonly bucketName: string;
  private readonly publicUrl: string;

  constructor() {
    const endpoint = process.env.R2_ENDPOINT || `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    this.bucketName = process.env.R2_BUCKET || process.env.R2_BUCKET_NAME || 'lejel-uploads';
    // Virtual-host style URL matches how the SDK signs GET/PUT requests against R2.
    // Path-style (`${endpoint}/${bucket}`) caused getKeyFromUrl to embed the bucket name
    // into the key, producing 404s on signed view URLs.
    const accountHost = endpoint.replace(/^https?:\/\//, '');
    this.publicUrl =
      process.env.R2_PUBLIC_URL || `https://${this.bucketName}.${accountHost}`;

    this.s3Client = new S3Client({
      region: 'auto',
      endpoint,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID || '',
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
      },
    });
  }

  async generateUploadUrl(
    fileName: string,
    contentType: string,
    taskId: string,
    folder: 'videos' | 'assets' = 'videos',
  ): Promise<{ signedUrl: string; key: string; publicUrl: string }> {
    const sanitizedName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
    const key = `tasks/${taskId}/${folder}/${randomUUID()}-${sanitizedName}`;

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      ContentType: contentType,
    });

    const signedUrl = await getSignedUrl(this.s3Client, command, { expiresIn: 3600 });

    const filePublicUrl = `${this.publicUrl}/${key}`;

    return { signedUrl, key, publicUrl: filePublicUrl };
  }

  async deleteFile(key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
    } catch (error) {
      this.logger.error(`Failed to delete file: ${key}`, error);
    }
  }

  async generateViewUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    });
    return getSignedUrl(this.s3Client, command, { expiresIn: 3600 });
  }

  getKeyFromUrl(url: string): string {
    try {
      if (this.publicUrl && url.startsWith(this.publicUrl)) {
        return url.slice(this.publicUrl.length + 1);
      }
      const urlObj = new URL(url);
      const path = urlObj.pathname.replace(/^\//, '');
      return path.startsWith(`${this.bucketName}/`)
        ? path.slice(this.bucketName.length + 1)
        : path;
    } catch {
      const match = url.match(/tasks\/.+/);
      return match ? match[0] : url.split('/').slice(3).join('/');
    }
  }

  getPublicUrl(key: string): string {
    return `${this.publicUrl}/${key}`;
  }
}
