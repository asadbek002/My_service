import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, Length, Matches, IsArray, ArrayMaxSize, IsInt, Min, IsIn, IsBoolean } from 'class-validator';
export class CustomerDto {
  @ApiProperty() @IsString() @Length(1, 100) firstName!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) lastName?: string;
  @ApiProperty() @IsString() @Matches(/^\+[1-9][0-9]{7,14}$/) phone!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Matches(/^@?[A-Za-z0-9_]{5,32}$/) telegramUsername?: string;
  @ApiPropertyOptional() @IsOptional() @IsIn(['AUTO','TELEGRAM','SMS']) notificationPreference?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}
export class DeviceDto {
  @ApiProperty() @IsString() @Length(1, 100) customerId!: string;
  @ApiProperty() @IsString() @Length(1, 100) category!: string;
  @ApiProperty() @IsString() @Length(1, 100) brand!: string;
  @ApiProperty() @IsString() @Length(1, 100) model!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 32) imei?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) serialNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 100) color?: string;
}
export class OrderDto {
  @ApiProperty() @IsString() @Length(1, 100) customerId!: string;
  @ApiProperty() @IsString() @Length(1, 100) deviceId!: string;
  @ApiProperty() @IsString() @Length(1, 100) branchId!: string;
  @ApiProperty() @IsString() @Length(1, 4000) complaint!: string;
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) accessories!: string[];
  @ApiProperty({ type: [String] }) @IsArray() @ArrayMaxSize(30) @IsString({ each: true }) condition!: string[];
}
export class AssignDto {
  @ApiProperty() @IsString() @Length(1, 100) userId!: string;
  @ApiProperty() @IsString() @Length(1, 500) task!: string;
}
export class StatusDto {
  @ApiProperty() @IsIn(['DIAGNOSING','WAITING_PART','IN_REPAIR','CANCELLED','UNREPAIRABLE']) status!: string;
  @ApiProperty() @IsString() @Length(1, 1000) comment!: string;
}
export class DiagnosisDto {
  @ApiProperty() @IsString() @Length(1, 4000) diagnosis!: string;
  @ApiProperty() @IsString() @Length(1, 4000) requiredWork!: string;
  @ApiProperty({ example: '150000.00' }) @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) labor!: string;
  @ApiProperty({ example: '700000.00' }) @IsString() @Matches(/^\d{1,12}(\.\d{1,2})?$/) partsTotal!: string;
}
export class ApprovalDto {
  @ApiProperty() @IsInt() @Min(1) quoteVersion!: number;
  @ApiProperty() @IsBoolean() approved!: boolean;
  @ApiProperty() @IsString() @Length(3, 1000) evidence!: string;
}
