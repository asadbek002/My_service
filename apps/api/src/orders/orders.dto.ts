import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Length, Matches, IsArray, ArrayMaxSize, IsIn, IsInt, Min, Max, IsBoolean } from 'class-validator';

const MONEY = /^\d{1,12}(\.\d{1,2})?$/;

export class CustomerDto {
  @ApiProperty() @IsString() @Length(1, 100) firstName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) lastName?: string;
  @ApiProperty() @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^@?[A-Za-z0-9_]{5,32}$/) telegramUsername?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['AUTO', 'TELEGRAM', 'SMS']) notificationPreference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}
export class DeviceDto {
  @ApiProperty() @IsString() @Length(1, 100) customerId!: string;
  @ApiProperty() @IsString() @Length(1, 100) category!: string;
  @ApiProperty() @IsString() @Length(1, 100) brand!: string;
  @ApiProperty() @IsString() @Length(1, 100) model!: string;
}
export class OrderDto {
  @ApiProperty() @IsString() @Length(1, 100) customerId!: string;
  @ApiProperty() @IsString() @Length(1, 100) deviceId!: string;
  @ApiProperty() @IsString() @Length(1, 4000) complaint!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) accessories!: string[];
  @ApiProperty({ example: '150000' }) @IsString() @Matches(MONEY) labor!: string;
  @ApiProperty({ example: '350000' }) @IsString() @Matches(MONEY) partsTotal!: string;
}
export class PriceDto {
  @ApiProperty({ example: '150000' }) @IsString() @Matches(MONEY) labor!: string;
  @ApiProperty({ example: '350000' }) @IsString() @Matches(MONEY) partsTotal!: string;
}
export class ComplaintDto {
  @ApiProperty() @IsString() @Length(1, 4000) complaint!: string;
}
export class StatusDto {
  @ApiProperty() @IsIn(['RECEIVED', 'IN_REPAIR', 'READY', 'CANCELLED']) status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 1000) comment?: string;
}
export class PaymentDto {
  @ApiProperty() @IsString() @Matches(MONEY) amount!: string;
  @ApiProperty() @IsString() @Length(1, 64) @Matches(/^[A-Z0-9_]+$/) method!: string;
  @ApiProperty() @IsString() @Length(16, 128) idempotencyKey!: string;
}
export class RefundDto {
  @ApiProperty() @IsString() @Matches(MONEY) amount!: string;
  @ApiProperty() @IsString() @Length(3, 1000) reason!: string;
  @ApiProperty() @IsString() @Length(16, 128) idempotencyKey!: string;
}
export class UndeliverDto {
  @ApiProperty() @IsString() @Length(3, 1000) reason!: string;
}
export class DeliverDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() allowDebt?: boolean;
  // 0 = delivered without warranty.
  @ApiProperty() @IsInt() @Min(0) @Max(1095) warrantyDays!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 4000) warrantyTerms?: string;
}
